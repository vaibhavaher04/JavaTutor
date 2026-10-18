let currentProblem = null;

// Normalize escaped newlines from DB
function normalizeText(text) {
    if (!text) return "";
    return text
        .replace(/\\r\\n/g, '\n')
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '    ');
}

// 1. Tab Key Support in Code Editor
function handleEditorTab(e) {
    if (e.key === 'Tab') {
        e.preventDefault();
        const editor = e.target;
        const start = editor.selectionStart;
        const end = editor.selectionEnd;

        // Insert 4 spaces
        editor.value = editor.value.substring(0, start) + "    " + editor.value.substring(end);
        editor.selectionStart = editor.selectionEnd = start + 4;
        updateLineNumbers();
    }
}

// 2. Fullscreen Toggle with Icon Flip
function toggleFullScreen() {
    const icon = document.getElementById('fullscreenIcon');
    const label = document.querySelector('#btnFullscreen span');

    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().then(() => {
            icon.className = "fa-solid fa-compress";
            if (label) label.textContent = "Exit Full Screen";
        }).catch(err => alert("Fullscreen error: " + err.message));
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen().then(() => {
                icon.className = "fa-solid fa-expand";
                if (label) label.textContent = "Full Screen";
            });
        }
    }
}

// Listen to OS-level fullscreen exit (e.g. user hits ESC key)
document.addEventListener('fullscreenchange', () => {
    const icon = document.getElementById('fullscreenIcon');
    const label = document.querySelector('#btnFullscreen span');
    if (!document.fullscreenElement && icon) {
        icon.className = "fa-solid fa-expand";
        if (label) label.textContent = "Full Screen";
    }
});

// 3. User Profile & Navbar Session Management
async function initNavbarSession() {
    const token = localStorage.getItem("javatutor_token");
    const container = document.getElementById("userProfileNav");
    if (!container) return;

    if (!token) {
        container.innerHTML = `<a href="index.html" class="btn btn-run" style="padding: 0.35rem 0.8rem; text-decoration: none;">Log In</a>`;
        return;
    }

    try {
        const res = await fetch("http://localhost:8000/api/user/profile", {
            headers: { "Authorization": `Bearer ${token}` }
        });
        if (!res.ok) throw new Error("Invalid token");
        const data = await res.json();

        const initial = data.username.charAt(0).toUpperCase();
        container.innerHTML = `
            <div class="user-avatar-btn" title="View Profile" onclick="openProfileModal('${data.username}', '${data.email}', ${data.solved_count}, ${data.total_submissions})">
                ${initial}
            </div>
        `;
    } catch {
        localStorage.removeItem("javatutor_token");
        container.innerHTML = `<a href="index.html" class="btn btn-run" style="padding: 0.35rem 0.8rem; text-decoration: none;">Log In</a>`;
    }
}

function openProfileModal(username, email, solved, submissions) {
    document.getElementById("modalUsername").textContent = username;
    document.getElementById("modalEmail").textContent = email;
    document.getElementById("modalSolved").textContent = solved;
    document.getElementById("modalSubmissions").textContent = submissions;
    document.getElementById("modalAvatar").textContent = username.charAt(0).toUpperCase();
    document.getElementById("profileModal").style.display = "flex";
}

function closeProfileModal(e) {
    document.getElementById("profileModal").style.display = "none";
}

function logoutUser() {
    localStorage.removeItem("javatutor_token");
    localStorage.removeItem("javatutor_user");
    window.location.href = "index.html";
}

// 4. Panel Switching & Slash Command Autocomplete
function showPanel(panelName) {
    const tabProblem = document.getElementById('tabProblem');
    const tabAI = document.getElementById('tabAI');
    const panelProblem = document.getElementById('panelProblem');
    const panelAI = document.getElementById('panelAI');

    if (panelName === 'problem') {
        tabProblem.classList.add('active');
        tabAI.classList.remove('active');
        panelProblem.style.display = 'block';
        panelAI.style.display = 'none';
    } else {
        tabAI.classList.add('active');
        tabProblem.classList.remove('active');
        panelProblem.style.display = 'none';
        panelAI.style.display = 'block';
        document.getElementById('aiChatInput').focus();
    }
}

function handleAIInputChange() {
    const input = document.getElementById('aiChatInput');
    const dropdown = document.getElementById('slashDropdown');
    const val = input.value;
    if (val.startsWith("/") && !val.includes(" ")) {
        dropdown.style.display = 'block';
    } else {
        dropdown.style.display = 'none';
    }
}

function selectSlashCommand(cmd) {
    const input = document.getElementById('aiChatInput');
    input.value = `${cmd} `;
    document.getElementById('slashDropdown').style.display = 'none';
    input.focus();
}

function insertConnector() {
    selectSlashCommand('/problem');
}

function handleAIInputKey(e) {
    const dropdown = document.getElementById('slashDropdown');
    if (dropdown && dropdown.style.display === 'block') {
        if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            selectSlashCommand('/problem');
            return;
        }
        if (e.key === 'Escape') {
            dropdown.style.display = 'none';
            return;
        }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendAIMessage();
    }
}

// 5. Safe Base64 Helpers
function safeDecode(base64Str) {
    if (!base64Str) return "";
    try {
        return decodeURIComponent(escape(window.atob(base64Str)));
    } catch {
        try { return window.atob(base64Str); } catch { return base64Str; }
    }
}

function safeEncode(str) {
    return btoa(unescape(encodeURIComponent(str || "")));
}

// 6. Code Execution (With Custom Input Fix & Submission Recording)
async function executeCode(isSubmit) {
    if (!currentProblem) return;

    const code = document.getElementById('codeEditor').value;
    const resultsDrawer = document.getElementById('resultsDrawer');
    const resultsBody = document.getElementById('resultsBody');
    const statusHeading = document.getElementById('resultStatusHeading');
    const useCustom = document.getElementById('customInputToggle').checked;

    const defaultTestCase = currentProblem.test_cases && currentProblem.test_cases.length > 0 
        ? currentProblem.test_cases[0] 
        : { stdin: "", expected_output: "" };

    // Fix: Properly handle custom input vs default problem test input
    let testInput = "";
    if (useCustom) {
        testInput = document.getElementById('customStdin').value;
    } else {
        testInput = normalizeText(defaultTestCase.stdin);
    }
    const expectedOutput = normalizeText(defaultTestCase.expected_output).trim();

    resultsDrawer.style.display = 'flex';
    statusHeading.className = "result-heading-success";
    statusHeading.textContent = "Compiling and executing via Judge0...";
    resultsBody.innerHTML = `<div style="color: var(--text-muted); padding: 1rem;"><i class="fa-solid fa-spinner fa-spin"></i> Sandboxed compilation in progress...</div>`;

    const payload = {
        source_code: safeEncode(code),
        language_id: 91, // OpenJDK 17
        stdin: safeEncode(testInput)
    };

    if (isSubmit && !useCustom) {
        payload.expected_output = safeEncode(expectedOutput);
    }

    try {
        const response = await fetch("https://ce.judge0.com/submissions?wait=true&base64_encoded=true", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        // 1. Compilation Error
        if (result.compile_output) {
            const errText = safeDecode(result.compile_output);
            statusHeading.className = "result-heading-error";
            statusHeading.textContent = "Compilation Error";
            resultsBody.innerHTML = `
                <div class="test-case-card" style="border-color: var(--error-red);">
                    <div class="test-case-card-header" style="background: var(--error-bg); color: var(--error-red);">
                        <span><i class="fa-solid fa-circle-xmark"></i> Syntax / Compile Error</span>
                    </div>
                    <div class="test-case-body" style="grid-template-columns: 1fr;">
                        <div class="io-block">
                            <label>Compiler Message:</label>
                            <div class="io-output-box" style="color: #f85149; white-space: pre-wrap;">${errText}</div>
                        </div>
                    </div>
                </div>`;
            if (isSubmit) recordSubmission("Compilation Error", result.time, result.memory);
            return;
        }

        // 2. Runtime Error
        if (result.stderr) {
            const errText = safeDecode(result.stderr);
            statusHeading.className = "result-heading-error";
            statusHeading.textContent = "Runtime Error / Exception";
            resultsBody.innerHTML = `
                <div class="test-case-card" style="border-color: var(--error-red);">
                    <div class="test-case-card-header" style="background: var(--error-bg); color: var(--error-red);">
                        <span><i class="fa-solid fa-triangle-exclamation"></i> Runtime Exception</span>
                    </div>
                    <div class="test-case-body" style="grid-template-columns: 1fr;">
                        <div class="io-block">
                            <label>Stack Trace:</label>
                            <div class="io-output-box" style="color: #f85149; white-space: pre-wrap;">${errText}</div>
                        </div>
                    </div>
                </div>`;
            if (isSubmit) recordSubmission("Runtime Error", result.time, result.memory);
            return;
        }

        const stdout = result.stdout ? safeDecode(result.stdout).trim() : "";

        if (isSubmit && !useCustom) {
            const isMatch = (stdout === expectedOutput) || (result.status && result.status.id === 3);

            if (isMatch) {
                statusHeading.className = "result-heading-success";
                statusHeading.textContent = "Congratulations! You solved this challenge.";
                resultsBody.innerHTML = `
                    <div class="test-case-card" style="border-color: var(--success-green);">
                        <div class="test-case-card-header" style="background: var(--success-bg); color: #3fb950;">
                            <span><i class="fa-solid fa-circle-check"></i> Test Case 0 - PASSED</span>
                            <span>Time: ${result.time || 0}s</span>
                        </div>
                        <div class="test-case-body">
                            <div class="io-block">
                                <label>Your Output (stdout)</label>
                                <div class="io-output-box">${stdout}</div>
                            </div>
                            <div class="io-block">
                                <label>Expected Output</label>
                                <div class="io-output-box">${expectedOutput}</div>
                            </div>
                        </div>
                    </div>`;
                recordSubmission("Accepted", result.time, result.memory);
            } else {
                statusHeading.className = "result-heading-error";
                statusHeading.textContent = "Wrong Answer! Output mismatch.";
                resultsBody.innerHTML = `
                    <div class="test-case-card" style="border-color: var(--error-red);">
                        <div class="test-case-card-header" style="background: var(--error-bg); color: var(--error-red);">
                            <span><i class="fa-solid fa-circle-xmark"></i> Test Case 0 - FAILED</span>
                        </div>
                        <div class="test-case-body">
                            <div class="io-block">
                                <label>Your Output (stdout)</label>
                                <div class="io-output-box" style="color: #f85149;">${stdout || "(Empty output)"}</div>
                            </div>
                            <div class="io-block">
                                <label>Expected Output</label>
                                <div class="io-output-box" style="color: #3fb950;">${expectedOutput}</div>
                            </div>
                        </div>
                    </div>`;
                recordSubmission("Wrong Answer", result.time, result.memory);
            }
        } else {
            // Run Code mode or Custom input mode
            statusHeading.className = "result-heading-success";
            statusHeading.textContent = useCustom ? "Custom Input Execution" : "Execution Successful";
            resultsBody.innerHTML = `
                <div class="test-case-card">
                    <div class="test-case-card-header">
                        <span><i class="fa-solid fa-terminal"></i> ${useCustom ? "Custom Stdin Run" : "Sample Run Output"}</span>
                        <span>Time: ${result.time || 0}s</span>
                    </div>
                    <div class="test-case-body" style="grid-template-columns: 1fr;">
                        <div class="io-block">
                            <label>Your Output:</label>
                            <div class="io-output-box">${stdout || "(No output produced)"}</div>
                        </div>
                    </div>
                </div>`;
        }

    } catch (err) {
        statusHeading.className = "result-heading-error";
        statusHeading.textContent = "Execution Error";
        resultsBody.innerHTML = `<div style="color: var(--error-red); padding: 1rem;">${err.message}</div>`;
    }
}

// 7. Record Submission in PostgreSQL
async function recordSubmission(status, time, memory) {
    const token = localStorage.getItem("javatutor_token");
    if (!token || !currentProblem) return;

    try {
        await fetch("http://localhost:8000/api/submissions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
                problem_id: currentProblem.id,
                submitted_code: document.getElementById('codeEditor').value,
                status: status,
                execution_time: time || "0.00",
                memory_used: memory ? String(memory) : "0"
            })
        });
    } catch (e) {
        console.error("Failed to record submission:", e);
    }
}

// 8. AI Chat Communication
async function sendAIMessage() {
    const input = document.getElementById('aiChatInput');
    const rawMsg = input.value.trim();
    if (!rawMsg) return;

    const dropdown = document.getElementById('slashDropdown');
    if (dropdown) dropdown.style.display = 'none';

    const token = localStorage.getItem("javatutor_token");
    if (!token) {
        alert("Please log in to chat with the AI Mentor!");
        return;
    }

    const chatContainer = document.getElementById('aiChatMessages');

    const userDiv = document.createElement('div');
    userDiv.className = 'user-bubble';
    userDiv.textContent = rawMsg;
    chatContainer.appendChild(userDiv);
    input.value = "";

    const aiDiv = document.createElement('div');
    aiDiv.className = 'ai-bubble';
    aiDiv.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Analyzing code and logic...';
    chatContainer.appendChild(aiDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;

    const hasProblemConnector = rawMsg.toLowerCase().includes('/problem');
    const problemId = (hasProblemConnector && currentProblem) ? currentProblem.id : null;
    const currentCode = hasProblemConnector ? document.getElementById('codeEditor').value : null;
    const cleanQuery = rawMsg.replace(/\/problem/gi, '').trim() || "Analyze my code and provide pseudocode or edge-case hints.";

    try {
        const res = await fetch("http://localhost:8000/api/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
                problem_id: problemId,
                message: cleanQuery,
                current_code: currentCode
            })
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.detail || `Server returned HTTP ${res.status}`);
        }

        const data = await res.json();
        if (window.marked && data.response) {
            aiDiv.innerHTML = marked.parse(data.response);
        } else {
            aiDiv.textContent = data.response || "No response received.";
        }
    } catch (err) {
        aiDiv.innerHTML = `<span style="color: var(--error-red);"><i class="fa-solid fa-triangle-exclamation"></i> Error reaching AI Mentor: ${err.message}</span>`;
    }
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// 9. Load Problem Data
async function loadProblem() {
    const urlParams = new URLSearchParams(window.location.search);
    const problemId = urlParams.get('problem_id') || 1;
    const token = localStorage.getItem("javatutor_token");

    initNavbarSession();

    try {
        const allRes = await fetch(`http://localhost:8000/api/problems${token ? '?token=' + token : ''}`);
        if (allRes.ok) {
            const list = await allRes.json();
            const select = document.getElementById('problemSelect');
            select.innerHTML = "";
            list.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = `${p.id}. ${p.title} (${p.difficulty}) ${p.is_solved ? '✔' : ''}`;
                if (p.id == problemId) opt.selected = true;
                select.appendChild(opt);
            });
        }

        const res = await fetch(`http://localhost:8000/api/problems/${problemId}`);
        if (!res.ok) throw new Error("Could not fetch problem data");
        const p = await res.json();
        currentProblem = p;

        document.getElementById('probTitle').textContent = p.title;
        document.getElementById('probDifficulty').textContent = p.difficulty;
        document.getElementById('probDifficulty').className = `difficulty-badge ${p.difficulty}`;
        document.getElementById('probDesc').innerHTML = p.description;
        document.getElementById('probInputFormat').innerHTML = p.input_format || "Standard input.";
        document.getElementById('probOutputFormat').innerHTML = p.output_format || "Standard output.";
        
        document.getElementById('probExample').textContent = normalizeText(p.example_io);
        document.getElementById('codeEditor').value = normalizeText(p.starter_code);

        updateLineNumbers();
        closeResults();
    } catch (e) {
        alert("Error loading problem: " + e.message);
    }
}

function switchProblemFromDropdown() {
    const select = document.getElementById('problemSelect');
    window.location.search = `?problem_id=${select.value}`;
}

function updateLineNumbers() {
    const editor = document.getElementById('codeEditor');
    const lineNumbers = document.getElementById('lineNumbers');
    const lines = editor.value.split('\n').length;
    let numbersHTML = "";
    for (let i = 1; i <= lines; i++) numbersHTML += i + "<br>";
    lineNumbers.innerHTML = numbersHTML;
}

function syncScroll() {
    const editor = document.getElementById('codeEditor');
    const lineNumbers = document.getElementById('lineNumbers');
    lineNumbers.scrollTop = editor.scrollTop;
}

function toggleCustomInput() {
    const wrapper = document.getElementById('customInputWrapper');
    const checkbox = document.getElementById('customInputToggle');
    wrapper.style.display = checkbox.checked ? 'block' : 'none';
}

function closeResults() {
    document.getElementById('resultsDrawer').style.display = 'none';
}

window.onload = loadProblem;