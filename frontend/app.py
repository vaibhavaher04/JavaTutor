# FRONTEND CODE RUN COMMAND: streamlit run app.py

import streamlit as st
import requests
import time

# --- PAGE CONFIG ---
st.set_page_config(
    page_title="SynapJava | AI Mentor",
    page_icon="🧠",
    layout="wide",
    initial_sidebar_state="expanded"
)

# --- HIGH-TECH DARK THEME CSS ---
st.markdown("""
    <style>
    /* Main Background */
    .stApp {
        background-color: #0E1117;
        color: #E0E0E0;
    }

    /* Sleek Dark Header */
    .synap-header {
        background: linear-gradient(90deg, #161B22 0%, #0D1117 100%);
        padding: 2rem;
        border-radius: 15px;
        border-bottom: 2px solid #F8981D; /* Java Orange */
        margin-bottom: 2rem;
        text-align: center;
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    }

    .synap-title {
        font-family: 'Inter', sans-serif;
        font-size: 3rem;
        font-weight: 800;
        color: #FFFFFF;
        letter-spacing: -1px;
        margin: 0;
    }

    .synap-subtitle {
        color: #F8981D;
        font-size: 1rem;
        text-transform: uppercase;
        letter-spacing: 2px;
    }

    /* Sidebar Styling */
    section[data-testid="stSidebar"] {
        background-color: #161B22 !important;
        border-right: 1px solid #30363D;
    }

    /* Buttons */
    .stButton>button {
        width: 100%;
        border-radius: 8px;
        background-color: #F8981D !important;
        color: #FFFFFF !important;
        font-weight: bold;
        border: none;
        transition: 0.3s all ease;
    }
    
    .stButton>button:hover {
        background-color: #FFB75E !important;
        transform: translateY(-2px);
        box-shadow: 0 5px 15px rgba(248, 152, 29, 0.4);
    }

    /* Chat Bubbles */
    [data-testid="stChatMessage"] {
        background-color: #1C2128;
        border-radius: 10px;
        margin-bottom: 1rem;
        border: 1px solid #30363D;
    }

    /* Status Text */
    .stAlert {
        border-radius: 10px;
        background-color: #0D1117;
        border: 1px solid #30363D;
    }
    </style>
    """, unsafe_allow_html=True)

# --- HEADER SECTION ---
st.markdown("""
    <div class="synap-header">
        <h1 class="synap-title">Synap<span style="color: #F8981D;">Java</span></h1>
        <p class="synap-subtitle">The Neural Bridge to Java Expertise</p>
    </div>
    """, unsafe_allow_html=True)

# --- SIDEBAR CONTROLS ---
with st.sidebar:
    st.markdown("### 🛠️ Neural Control Panel")
    st.info("SynapJava Tutor Mode Active. Strictly enforcing Java and Pseudocode rules.")
    
    st.markdown("---")
    if st.button("🗑️ PURGE MEMORY", help="Clears Conversation history"):
        with st.spinner("Purging..."):
            requests.post("http://localhost:8000/clear")
            st.session_state.messages = []
            st.toast("Neural Memory Cleared", icon='🔥')
            time.sleep(1)
            st.rerun()

# --- CHAT INTERFACE ---
if "messages" not in st.session_state:
    st.session_state.messages = []

# Display History
for message in st.session_state.messages:
    with st.chat_message(message["role"]):
        st.markdown(message["content"])

# User Input
if prompt := st.chat_input("Query the Java Mentor..."):
    # Add User Message
    st.session_state.messages.append({"role": "user", "content": prompt})
    with st.chat_message("user"):
        st.markdown(prompt)

    # Generate Assistant Response
    with st.chat_message("assistant"):
        with st.spinner("Processing through Java Nodes..."):
            try:
                response = requests.post("http://localhost:8000/chat", data={"message": prompt})
                if response.status_code == 200:
                    answer = response.json()["response"]
                    
                    # Guardrail feedback styling
                    if "Ask only questions related to java" in answer:
                        st.warning(answer)
                    else:
                        st.markdown(answer)
                        
                    st.session_state.messages.append({"role": "assistant", "content": answer})
                else:
                    st.error("Neural Node Offline (Backend Error)")
            except:
                st.error("Failed to reach SynapJava Core.")