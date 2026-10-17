import os
from fastapi import FastAPI, Form
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.chat_history import InMemoryChatMessageHistory
from langchain_core.runnables.history import RunnableWithMessageHistory
from langchain_core.runnables import RunnableLambda
from dotenv import load_dotenv

app = FastAPI()

# --- CONFIGURATION ---
load_dotenv()
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

# Initialize Google Gemini 3.8 Flash
llm = ChatGoogleGenerativeAI(
    model="gemini-3.8-flash",
    google_api_key=GOOGLE_API_KEY
)

session_store = {}

def get_session_history(session_id: str):
    if session_id not in session_store:
        session_store[session_id] = InMemoryChatMessageHistory()
    return session_store[session_id]

# --- HELPER TO CLEAN GEMINI 3.8 OUTPUT ---
def extract_clean_text(ai_message) -> str:
    """Extracts clean text from Gemini 3.8's list/signature format."""
    content = ai_message.content
    if isinstance(content, list):
        # Extract only the 'text' parts and ignore 'extras'/'signature'
        text_parts = [
            block.get("text", "") 
            for block in content 
            if isinstance(block, dict) and block.get("type") == "text"
        ]
        return "\n".join(text_parts).strip()
    return str(content)

# --- STRICT JAVA TUTOR PROMPT ---
system_prompt = (
    "You are an expert Java Programming Tutor. "
    "Your goal is to help students solve coding problems by improving their critical thinking. "
    "RULES:\n"
    "1. NEVER write the complete Java code solution for the user.\n"
    "2. Provide step-by-step logic, pseudocode, formulas, and mention useful Java classes/methods (e.g., HashMap, Arrays.sort).\n"
    "3. Only answer questions related to Java, data structures, and algorithms. "
    "If a question is outside this scope, strictly reply: 'Ask only questions related to java'"
)

prompt = ChatPromptTemplate.from_messages([
    ("system", system_prompt),
    MessagesPlaceholder(variable_name="chat_history"),
    ("human", "{question}")
])

def get_chat_chain():
    # Pass LLM output through our custom extractor instead of StrOutputParser
    base_chain = prompt | llm | RunnableLambda(extract_clean_text)
    return RunnableWithMessageHistory(
        base_chain,
        get_session_history,
        input_messages_key="question",
        history_messages_key="chat_history"
    )

@app.post("/chat")
async def chat(message: str = Form(...)):
    chain = get_chat_chain()
    response = chain.invoke(
        {"question": message},
        config={"configurable": {"session_id": "user_session_1"}}
    )
    return {"response": response}

@app.post("/clear")
async def clear_db():
    global session_store
    session_store.clear()
    return {"message": "Chat memory cleared successfully!"}