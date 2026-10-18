let currentProblem = null;

function normalizeText(text) {
    if (!text) return "";
    return text
        .replace(/\\r\\n/g, '\n')
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '    ');
}

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

// Show slash menu only when actively typing the command keyword
function handleAIInputChange() {
    const input = document.getElementById('aiChatInput');
    const dropdown = document.getElementById('slashDropdown');
    const val = input.value;

    // Show menu only if user typed '/' or is typing a command, but hide once a space is entered
    if (val.startsWith("/") && !val.includes(" ")) {
        dropdown.style.display = 'block';
    } else {
        dropdown.style.display = 'none';
    }
}

function selectSlashCommand(cmd) {
    const input = document.getElementById('aiChatInput');
    // Replace the slash token with command followed by a space
    input.value = `${cmd} `;
    document.getElementById('slashDropdown').style.display = 'none';
    input.focus();
}

function insertConnector() {
    selectSlashCommand('/problem');
}

// Handle Enter and Tab keys cleanly
function handleAIInputKey(e) {
    const dropdown = document.getElementById('slashDropdown');

    // Only intercept Enter/Tab when the dropdown is actually visible
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

    // Normal Enter submits the message; Shift+Enter creates a new line
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendAIMessage();
    }
}

async function sendAIMessage() {
    const input = document.getElementById('aiChatInput');
    const rawMsg = input.value.trim();
    if (!rawMsg) return;

    // Immediately close dropdown
    const dropdown = document.getElementById('slashDropdown');
    if (dropdown) dropdown.style.display = 'none';

    // Verify authentication token
    const token = localStorage.getItem("javatutor_token");
    if (!token) {
        alert("You must be logged in to chat with the AI Mentor! Please log in via index.html.");
        return;
    }

    const chatContainer = document.getElementById('aiChatMessages');

    // Append User Bubble
    const userDiv = document.createElement('div');
    userDiv.className = 'user-bubble';
    userDiv.textContent = rawMsg;
    chatContainer.appendChild(userDiv);
    input.value = "";

    // Append AI Loading Indicator
    const aiDiv = document.createElement('div');
    aiDiv.className = 'ai-bubble';
    aiDiv.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Analyzing code and logic...';
    chatContainer.appendChild(aiDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;

    // Detect /problem connector
    const hasProblemConnector = rawMsg.toLowerCase().includes('/problem');
    const problemId = (hasProblemConnector && currentProblem) ? currentProblem.id : null;
    
    // Capture user's editor code only if /problem is tagged
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
        
        // Render formatted Markdown
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

// Load problem details from FastAPI
async function loadProblem() {
    const urlParams = new URLSearchParams(window.location.search);
    const problemId = urlParams.get('problem_id') || 1;

    try {
        const allRes = await fetch("http://localhost:8000/api/problems");
        if (allRes.ok) {
            const list = await allRes.json();
            const select = document.getElementById('problemSelect');
            select.innerHTML = "";
            list.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = `${p.id}. ${p.title} (${p.difficulty})`;
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

function toggleFullScreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => alert(err.message));
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
    }
}

function safeDecode(base64Str) {
    if (!base64Str) return "";
    try {
        return decodeURIComponent(escape(window.atob(base64Str)));
    } catch (e) {
        try { return window.atob(base64Str); } catch (err) { return base64Str; }
    }
}

async function executeCode(isSubmit) {
    if (!currentProblem) return;

    const code = document.getElementById('codeEditor').value;
    const resultsDrawer = document.getElementById('resultsDrawer');
    const resultsBody = document.getElementById('resultsBody');
    const statusHeading = document.getElementById('resultStatusHeading');
    const useCustom = document.getElementById('customInputToggle').checked;

    const testCase = currentProblem.test_cases && currentProblem.test_cases.length > 0 
        ? currentProblem.test_cases[0] 
        : { stdin: "", expected_output: "" };

    const testInput = useCustom ? document.getElementById('customStdin').value : normalizeText(testCase.stdin);
    const expectedOutput = normalizeText(testCase.expected_output).trim();

    resultsDrawer.style.display = 'flex';
    statusHeading.className = "result-heading-success";
    statusHeading.textContent = "Compiling and executing via Judge0...";
    resultsBody.innerHTML = `<div style="color: var(--text-muted); padding: 1rem;"><i class="fa-solid fa-spinner fa-spin"></i> Sandboxed compilation in progress...</div>`;

    const payload = {
        source_code: btoa(unescape(encodeURIComponent(code))),
        language_id: 91, // OpenJDK 17
        stdin: btoa(unescape(encodeURIComponent(testInput)))
    };

    if (isSubmit) {
        payload.expected_output = btoa(unescape(encodeURIComponent(expectedOutput)));
    }

    try {
        const response = await fetch("https://ce.judge0.com/submissions?wait=true&base64_encoded=true", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

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
                            <label>Compiler Output:</label>
                            <div class="io-output-box" style="color: #f85149; white-space: pre-wrap;">${errText}</div>
                        </div>
                    </div>
                </div>`;
            return;
        }

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
            return;
        }

        const stdout = result.stdout ? safeDecode(result.stdout).trim() : "";

        if (isSubmit) {
            const isMatch = (stdout === expectedOutput) || (result.status && result.status.id === 3);

            if (isMatch) {
                statusHeading.className = "result-heading-success";
                statusHeading.textContent = "Congratulations! You passed all test cases.";
                resultsBody.innerHTML = `
                    <div class="test-case-card" style="border-color: var(--success-green);">
                        <div class="test-case-card-header" style="background: var(--success-bg); color: #3fb950;">
                            <span><i class="fa-solid fa-circle-check"></i> Sample Test Case 0 - PASSED</span>
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
            } else {
                statusHeading.className = "result-heading-error";
                statusHeading.textContent = "Wrong Answer! Output mismatch.";
                resultsBody.innerHTML = `
                    <div class="test-case-card" style="border-color: var(--error-red);">
                        <div class="test-case-card-header" style="background: var(--error-bg); color: var(--error-red);">
                            <span><i class="fa-solid fa-circle-xmark"></i> Sample Test Case 0 - FAILED</span>
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
            }
        } else {
            statusHeading.className = "result-heading-success";
            statusHeading.textContent = "Execution Successful";
            resultsBody.innerHTML = `
                <div class="test-case-card">
                    <div class="test-case-card-header">
                        <span><i class="fa-solid fa-terminal"></i> Run Code Output</span>
                        <span>Time: ${result.time || 0}s</span>
                    </div>
                    <div class="test-case-body" style="grid-template-columns: 1fr;">
                        <div class="io-block">
                            <label>Output:</label>
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

window.onload = loadProblem;