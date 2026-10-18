# BACKEND CODE RUN COMMAND: uvicorn main:app --reload
import os
import asyncpg
from datetime import datetime, timedelta
from fastapi import FastAPI, Depends, HTTPException, status, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
import bcrypt
from pydantic import BaseModel, EmailStr
from typing import Optional, List
import jwt
from dotenv import load_dotenv

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.runnables import RunnableLambda

load_dotenv()

# --- CONFIGURATION ---
DB_URL = os.getenv("DATABASE_URL")
SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 1440 # 24 hours
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

app = FastAPI(title="JavaTutor API")

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

# AI LLM Setup (Gemini 3.8 Flash)
llm = ChatGoogleGenerativeAI(
    model="gemini-3.8-flash",
    google_api_key=GOOGLE_API_KEY
)

def extract_clean_text(ai_message) -> str:
    content = ai_message.content
    if isinstance(content, list):
        text_parts = [b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text"]
        return "\n".join(text_parts).strip()
    return str(content)

# Database Connection Pool
@app.on_event("startup")
async def startup():
    app.state.db = await asyncpg.create_pool(DB_URL)

@app.on_event("shutdown")
async def shutdown():
    await app.state.db.close()

# --- AUTH HELPERS ---
def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = payload.get("user_id")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        return user_id
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Could not validate credentials")

# --- PASSWORD HASHING HELPERS ---
def hash_password(password: str) -> str:
    # Truncate to 72 bytes to strictly satisfy bcrypt's limit
    pwd_bytes = password.encode('utf-8')[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    pwd_bytes = plain_password.encode('utf-8')[:72]
    hash_bytes = hashed_password.encode('utf-8')
    return bcrypt.checkpw(pwd_bytes, hash_bytes)

# --- SCHEMAS ---
class UserRegister(BaseModel):
    username: str
    email: EmailStr
    password: str

class SubmissionCreate(BaseModel):
    problem_id: int
    submitted_code: str
    status: str
    execution_time: Optional[str] = "0.00"
    memory_used: Optional[str] = "0"

class ChatMessagePayload(BaseModel):
    problem_id: Optional[int] = None
    message: str
    current_code: Optional[str] = None

# --- AUTH ENDPOINTS ---
@app.post("/api/auth/register")
async def register(user: UserRegister):
    hashed_pwd = hash_password(user.password)
    try:
        row = await app.state.db.fetchrow(
            "INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email",
            user.username, user.email, hashed_pwd
        )
        token = create_access_token({"user_id": row["id"], "username": row["username"]})
        return {"token": token, "username": row["username"]}
    except asyncpg.UniqueViolationError:
        raise HTTPException(status_code=400, detail="Username or email already exists")

@app.post("/api/auth/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    user = await app.state.db.fetchrow(
        "SELECT * FROM users WHERE username = $1", form_data.username
    )
    if not user or not verify_password(form_data.password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    
    token = create_access_token({"user_id": user["id"], "username": user["username"]})
    return {"access_token": token, "token_type": "bearer", "username": user["username"]}

# --- PROBLEMS ENDPOINTS ---
@app.get("/api/problems")
async def get_problems(difficulty: Optional[str] = None):
    query = "SELECT id, title, difficulty, description FROM problems"
    if difficulty and difficulty != "All":
        query += f" WHERE difficulty = '{difficulty}'"
    query += " ORDER BY id ASC"
    rows = await app.state.db.fetch(query)
    return [dict(r) for r in rows]

@app.get("/api/problems/{problem_id}")
async def get_problem_detail(problem_id: int):
    prob = await app.state.db.fetchrow("SELECT * FROM problems WHERE id = $1", problem_id)
    if not prob:
        raise HTTPException(status_code=404, detail="Problem not found")
    
    test_cases = await app.state.db.fetch(
        "SELECT stdin, expected_output, is_sample FROM test_cases WHERE problem_id = $1", problem_id
    )
    res = dict(prob)
    res["test_cases"] = [dict(t) for t in test_cases]
    return res

# --- SUBMISSIONS ENDPOINTS ---
@app.post("/api/submissions")
async def save_submission(sub: SubmissionCreate, user_id: int = Depends(get_current_user)):
    await app.state.db.execute(
        """INSERT INTO submissions (user_id, problem_id, submitted_code, status, execution_time, memory_used)
           VALUES ($1, $2, $3, $4, $5, $6)""",
        user_id, sub.problem_id, sub.submitted_code, sub.status, sub.execution_time, sub.memory_used
    )
    return {"message": "Submission recorded"}

@app.get("/api/submissions/history")
async def get_user_submissions(user_id: int = Depends(get_current_user)):
    rows = await app.state.db.fetch(
        """SELECT s.id, p.title, s.status, s.execution_time, s.created_at 
           FROM submissions s JOIN problems p ON s.problem_id = p.id
           WHERE s.user_id = $1 ORDER BY s.created_at DESC LIMIT 20""",
        user_id
    )
    return [dict(r) for r in rows]

# --- AI TUTOR & CHAT HISTORY ENDPOINT ---
@app.post("/api/chat")
async def tutor_chat(payload: ChatMessagePayload, user_id: int = Depends(get_current_user)):
    # 1. Fetch Chat History from PostgreSQL
    history_records = await app.state.db.fetch(
        """SELECT sender, message FROM chat_history 
           WHERE user_id = $1 AND ($2::INT IS NULL OR problem_id = $2::INT)
           ORDER BY created_at ASC LIMIT 10""",
        user_id, payload.problem_id
    )
    
    # 2. Build Context Strings safely
    prob_context = "No specific problem selected."
    if payload.problem_id:
        prob = await app.state.db.fetchrow(
            "SELECT title, description FROM problems WHERE id = $1", 
            payload.problem_id
        )
        if prob:
            prob_context = f"Title: {prob['title']}\nDescription: {prob['description']}"
    
    code_context = "No code snapshot provided."
    if payload.current_code and payload.current_code.strip():
        code_context = f"```java\n{payload.current_code.strip()}\n```"

    # 3. Create Restrictive Prompt with placeholders (curly braces won't crash)
    system_prompt = (
        "You are an expert Java Programming Tutor. "
        "Your goal is to help students solve coding problems by improving their critical thinking.\n\n"
        "RULES:\n"
        "1. NEVER write the full or complete Java solution code.\n"
        "2. If the user provided code, point out the specific lines or logic where their mistake is, explain *why* it fails, and provide pseudocode or guidance to fix it.\n"
        "3. Provide step-by-step logic, pseudocode, and useful Java classes/methods.\n"
        "4. Format your response cleanly using Markdown (headers, bullet points, code blocks).\n"
        "5. Strictly reply: 'Ask only questions related to java' if off-topic.\n\n"
        "--- ACTIVE PROBLEM CONTEXT ---\n{problem_context}\n\n"
        "--- USER'S CURRENT JAVA CODE ---\n{code_context}"
    )

    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt),
        MessagesPlaceholder(variable_name="chat_history"),
        ("human", "{question}")
    ])
    
    formatted_history = [
        (h["sender"] if h["sender"] == "user" else "assistant", h["message"]) 
        for h in history_records
    ]
    chain = prompt | llm | RunnableLambda(extract_clean_text)
    
    ai_response = chain.invoke({
        "problem_context": prob_context,
        "code_context": code_context,
        "chat_history": formatted_history,
        "question": payload.message
    })

    # 4. Save to PostgreSQL
    await app.state.db.execute(
        "INSERT INTO chat_history (user_id, problem_id, sender, message) VALUES ($1, $2, 'user', $3)",
        user_id, payload.problem_id, payload.message
    )
    await app.state.db.execute(
        "INSERT INTO chat_history (user_id, problem_id, sender, message) VALUES ($1, $2, 'assistant', $3)",
        user_id, payload.problem_id, ai_response
    )

    return {"response": ai_response}