// --- IndexedDB Helper Class ---
// This class manages persistence for Workout History and PRs
class GainsLogDB {
    constructor(dbName = 'GainsLogDB', version = 1) {
        this.dbName = dbName;
        this.version = version;
        this.db = null;
        this.STORE_HISTORY = 'workoutHistory'; // Store for completed workouts
        this.STORE_PRS = 'personalRecords';   // Store for PRs (Key-Value)
    }

    // 1. Initialise and open the database connection
    openDB() {
        return new Promise((resolve, reject) => {
            if (!('indexedDB' in window)) {
                reject('IndexedDB is not supported by your browser.');
                return;
            }

            const request = indexedDB.open(this.dbName, this.version);

            request.onupgradeneeded = (event) => {
                this.db = event.target.result;
                
                // Create workoutHistory store
                if (!this.db.objectStoreNames.contains(this.STORE_HISTORY)) {
                    // keyPath: 'id' is required, autoIncrement handles unique IDs
                    this.db.createObjectStore(this.STORE_HISTORY, { keyPath: 'id', autoIncrement: true });
                }
                
                // Create personalRecords store (using 'name' as key path)
                if (!this.db.objectStoreNames.contains(this.STORE_PRS)) {
                    this.db.createObjectStore(this.STORE_PRS, { keyPath: 'name' });
                }
                console.log(`[IndexedDB] Database setup complete for version ${this.version}.`);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
                console.log('[IndexedDB] Database connection successful.');
            };

            request.onerror = (event) => {
                reject(`[IndexedDB] Database error: ${event.target.errorCode}`);
            };
        });
    }

    // Helper to get a transaction object
    getTransaction(storeName, mode = 'readonly') {
        if (!this.db) {
            throw new Error('Database is not open. Call openDB() first.');
        }
        return this.db.transaction(storeName, mode).objectStore(storeName);
    }

    // --- WORKOUT HISTORY METHODS ---

    addWorkout(workout) {
        return new Promise((resolve, reject) => {
            const store = this.getTransaction(this.STORE_HISTORY, 'readwrite');
            
            // Crucial fix: Remove the ID property to ensure IndexedDB's autoIncrement generates a new one
            delete workout.id; 

            const request = store.add(workout); 

            request.onsuccess = (event) => {
                workout.id = event.target.result; // Update the session object with the new ID
                resolve(workout.id);
            };
            request.onerror = (event) => reject(`Error adding workout: ${event.target.error}`);
        });
    }

    getAllWorkouts() {
        return new Promise((resolve, reject) => {
            const store = this.getTransaction(this.STORE_HISTORY, 'readonly');
            const request = store.getAll();

            request.onsuccess = (event) => resolve(event.target.result);
            request.onerror = (event) => reject(`Error getting all workouts: ${event.target.error}`);
        });
    }

    // --- PR METHODS ---
    
    // Saves a single PR (uses 'name' as the key to overwrite existing PRs for that exercise)
    savePR(pr) {
         return new Promise((resolve, reject) => {
            const store = this.getTransaction(this.STORE_PRS, 'readwrite');
            const request = store.put(pr); // use put for save/update

            request.onsuccess = (event) => resolve(event.target.result);
            request.onerror = (event) => reject(`Error saving PR: ${event.target.error}`);
        });
    }
    
    getAllPRs() {
        return new Promise((resolve, reject) => {
            const store = this.getTransaction(this.STORE_PRS, 'readonly');
            const request = store.getAll();

            request.onsuccess = (event) => resolve(event.target.result);
            request.onerror = (event) => reject(`Error getting all PRs: ${event.target.error}`);
        });
    }

    // --- FIX: CLEAR DATA METHOD (for direct access and Service Worker fallback) ---
    clearAllData() {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Database is not open. Cannot clear data.'));
                return;
            }
            try {
                // Begin a transaction that covers both stores
                const transaction = this.db.transaction([this.STORE_HISTORY, this.STORE_PRS], 'readwrite');

                transaction.oncomplete = () => resolve();
                transaction.onerror = (event) => reject(`Error clearing data: ${event.target.error}`);

                // Clear each store
                transaction.objectStore(this.STORE_HISTORY).clear();
                transaction.objectStore(this.STORE_PRS).clear();
                
            } catch(e) {
                reject(e);
            }
        });
    }
}


// --- GLOBAL INSTANCES ---
const dbHelper = new GainsLogDB();


// --- PWA Setup ---
// Register the Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('service-worker.js')
            .then(registration => console.log('SW registered: ', registration.scope))
            .catch(err => console.log('SW registration failed: ', err));
    });
}


// --- Global State and Element References ---

// Global State for the current workout session
let currentWorkout = {
    // Unique ID for the session, will be assigned by IndexedDB on save
    id: null, 
    date: new Date().toISOString().slice(0, 10), // YYYY-MM-DD
    exercises: []
};

// Global State for saved routines and PRs
// Routines remain in localStorage for simplicity
let routines = JSON.parse(localStorage.getItem('gainslog_routines') || '[]');
// PRs are now loaded from IndexedDB, but we keep a local object for comparison
let personalRecords = {}; 
let editingRoutineId = null; 

// Global Timer Variables
const DEFAULT_REST_DURATION = 90; 
let userRestDuration = parseInt(localStorage.getItem('gainslog_rest_duration')) || DEFAULT_REST_DURATION; 
let timerInterval;
let timeLeft = userRestDuration; 

// SWIPE/NAVIGATION STATE
let currentTabIndex = 0; 
let startX = 0;
const SWIPE_THRESHOLD = 50; 


// Element references (Current Workout View)
const exerciseListEl = document.getElementById('exercise-list');
const addExerciseBtn = document.getElementById('add-exercise-btn');
const finishWorkoutBtn = document.getElementById('finish-workout-btn');
const restTimerEl = document.getElementById('rest-timer');
const timerDisplayEl = document.getElementById('timer-display');
const skipTimerBtn = document.getElementById('skip-timer-btn');

// Element references (Progress View - now houses history)
const historyContainerEl = document.getElementById('workout-history-container');

// Element references (Routines View)
const routinesListEl = document.getElementById('routines-list-container');
const addRoutineBtn = document.getElementById('add-routine-btn');

// Element References (Routine Editor Modal)
const routineEditorView = document.getElementById('routine-editor-view');
const routineEditorTitle = document.getElementById('routine-editor-title');
const routineEditorList = document.getElementById('routine-editor-list');
const addExerciseToRoutineBtn = document.getElementById('add-exercise-to-routine-btn');
const closeEditorBtn = document.getElementById('close-editor-btn');

// Swipe and Navigation Elements
const swipeWrapperEl = document.getElementById('swipe-wrapper');
const tabButtons = document.querySelectorAll('.tab-button');


// --- SWIPE AND NAVIGATION FUNCTIONS ---

function switchPage(index) {
    routineEditorView.classList.add('hidden'); 
    index = Math.max(0, Math.min(3, index));
    currentTabIndex = index;
    
    const translateValue = index * -100;
    swipeWrapperEl.style.transform = `translateX(${translateValue}vw)`;

    tabButtons.forEach(btn => {
        btn.classList.remove('active');
        if (parseInt(btn.dataset.index) === index) {
            btn.classList.add('active');
        }
    });

    const targetViewName = tabButtons[index].dataset.view;
    if (targetViewName === 'progress') {
        renderHistory();
    } else if (targetViewName === 'routines') {
        renderRoutines();
    } else if (targetViewName === 'profile') {
        updateProfileStats();
    } else if (targetViewName === 'current') {
        renderCurrentWorkout();
    }
}

function handleTouchStart(e) {
    startX = e.touches[0].clientX;
    swipeWrapperEl.style.transition = 'none'; 
}

function handleTouchMove(e) {
    const currentX = e.touches[0].clientX;
    const diff = currentX - startX;
    
    if (currentTabIndex < 3) {
        const baseOffset = currentTabIndex * window.innerWidth;
        swipeWrapperEl.style.transform = `translateX(${(-baseOffset + diff)}px)`;
    }
}

function handleTouchEnd(e) {
    const endX = e.changedTouches[0].clientX;
    const diff = endX - startX;
    
    swipeWrapperEl.style.transition = 'transform 0.3s ease-out'; 

    if (currentTabIndex >= 3) {
        switchPage(currentTabIndex);
        return;
    }
    
    if (diff > SWIPE_THRESHOLD && currentTabIndex > 0) {
        switchPage(currentTabIndex - 1);
    } else if (diff < -SWIPE_THRESHOLD && currentTabIndex < 2) {
        switchPage(currentTabIndex + 1);
    } else {
        switchPage(currentTabIndex);
    }
}


// --- CORE WORKOUT FUNCTIONS ---

// 1. Adds a New Exercise to the Current Session
function addExercise() {
    const name = prompt("Enter Exercise Name (e.g., Squats, Bench Press):");
    if (!name) return;

    const newExercise = {
        id: Date.now() + Math.random(), 
        name: name,
        sets: [
            { setNumber: 1, weight: '', reps: '', completed: false }
        ]
    };
    currentWorkout.exercises.push(newExercise);
    
    renderCurrentWorkout();
    finishWorkoutBtn.classList.remove('hidden');
}


// 2. Generates the HTML for the Current Session 
function renderCurrentWorkout() {
    exerciseListEl.innerHTML = ''; 

    if (currentWorkout.exercises.length === 0) {
        exerciseListEl.innerHTML = '<p class="placeholder-text">Start a new session or load a Routine.</p>';
        finishWorkoutBtn.classList.add('hidden');
        return;
    }

    currentWorkout.exercises.forEach(exercise => {
        const card = document.createElement('div');
        card.className = 'exercise-card';
        
        // Exercise Name and Management Menu Button
        card.innerHTML = `
            <h3>
                ${exercise.name}
                <button class="management-btn" data-exercise-id="${exercise.id}">⋮</button>
            </h3>
            <div id="menu-${exercise.id}" class="management-menu hidden">
                <button onclick="editExerciseName(${exercise.id})">Edit Name</button>
                <button class="delete-btn" onclick="deleteExercise(${exercise.id})">Delete Exercise</button>
            </div>
        `;
        
        exercise.sets.forEach(set => {
            const setRow = document.createElement('div');
            setRow.className = 'set-row';
            
            // 1. Set Number 
            setRow.innerHTML += `<span class="set-number">${set.setNumber}</span>`;
            
            // 2. Weight Input Group 
            setRow.innerHTML += `
                <div class="input-group">
                    <span class="input-label">Weight (kg)</span>
                    <input type="number" data-set-id="${set.setNumber}" data-field="weight" 
                           value="${set.weight}" placeholder="100" inputmode="decimal">
                </div>`;
            
            // 3. Reps Input Group 
            setRow.innerHTML += `
                <div class="input-group">
                    <span class="input-label">Reps</span>
                    <input type="number" data-set-id="${set.setNumber}" data-field="reps" 
                           value="${set.reps}" placeholder="10" inputmode="numeric">
                </div>`;
            
            // 4. Completion Circle 
            const statusEl = document.createElement('div');
            statusEl.className = set.completed ? 'set-status completed' : 'set-status';
            statusEl.dataset.exerciseId = exercise.id;
            statusEl.dataset.setNumber = set.setNumber;
            
            setRow.appendChild(statusEl);
            card.appendChild(setRow);
        });

        // Add New Set Button
        const addSetBtn = document.createElement('button');
        addSetBtn.className = 'secondary-btn'; 
        addSetBtn.style.marginTop = '10px';
        addSetBtn.style.padding = '10px';
        addSetBtn.textContent = '+ Add Set';
        addSetBtn.onclick = () => addSetToExercise(exercise.id);
        
        card.appendChild(addSetBtn);
        exerciseListEl.appendChild(card);
    });
}


// 3. Adds a new set to an existing exercise
function addSetToExercise(exerciseId) {
    const exercise = currentWorkout.exercises.find(e => e.id === exerciseId);
    if (exercise) {
        const newSetNumber = exercise.sets.length + 1;
        
        // Use previous set data for auto-fill on the new set
        const prevSet = exercise.sets[exercise.sets.length - 1] || { weight: '', reps: '' };

        exercise.sets.push({
            setNumber: newSetNumber,
            weight: prevSet.weight, 
            reps: prevSet.reps,     
            completed: false
        });
        renderCurrentWorkout(); 
    }
}

// 4. Handles saving workout data to IndexedDB
async function finishAndSaveWorkout() {
    if (currentWorkout.exercises.length === 0) {
        alert("Cannot save an empty workout!");
        return;
    }
    
    // Set the date before saving
    currentWorkout.date = new Date().toISOString().slice(0, 10);

    try {
        // 1. Update Personal Records (will save to IndexedDB)
        await updatePersonalRecords(currentWorkout);

        // 2. Save history to IndexedDB (ID will be assigned here)
        await dbHelper.addWorkout(currentWorkout);

        // 3. Reset state
        currentWorkout = {
            id: null,
            date: new Date().toISOString().slice(0, 10),
            exercises: []
        };
        
        alert(`Workout saved successfully!`);
        renderCurrentWorkout(); 
        
        // 4. Update UI views
        renderHistory(); 
        updateProfileStats(); 
    } catch (error) {
        console.error("Failed to save workout data to IndexedDB:", error);
        alert("Error saving workout. See console for details.");
    }
}

// 5. Handles Exercise Management (Delete/Edit)
function deleteExercise(exerciseId) {
    if (confirm("Are you sure you want to delete this exercise and all its sets?")) {
        currentWorkout.exercises = currentWorkout.exercises.filter(e => e.id !== exerciseId);
        renderCurrentWorkout();
    }
}

function editExerciseName(exerciseId) {
    const exercise = currentWorkout.exercises.find(e => e.id === exerciseId);
    if (exercise) {
        const newName = prompt("Edit Exercise Name:", exercise.name);
        if (newName && newName.trim() !== "") {
            exercise.name = newName.trim();
            renderCurrentWorkout();
        }
    }
}


// --- PROGRESS / HISTORY / PR FUNCTIONS ---

// Compares completed sets in the current workout to saved PRs and updates IndexedDB
async function updatePersonalRecords(workout) {
    let updated = false;
    let prsToSave = []; 

    workout.exercises.forEach(exercise => {
        const nameKey = exercise.name.trim().toUpperCase();
        
        exercise.sets.filter(s => s.completed && s.weight && s.reps).forEach(set => {
            const setWeight = parseFloat(set.weight);
            const setReps = parseInt(set.reps);

            const currentPR = personalRecords[nameKey];

            if (!currentPR || setWeight > currentPR.weight) {
                // New Weight PR
                const newPR = {
                    name: nameKey, 
                    weight: setWeight,
                    reps: setReps,
                    date: workout.date 
                };
                personalRecords[nameKey] = newPR;
                prsToSave.push(newPR);
                updated = true;
                
            } else if (setWeight === currentPR.weight && setReps > currentPR.reps) {
                // Rep PR at the same maximum weight
                const newPR = {
                    name: nameKey,
                    weight: setWeight,
                    reps: setReps,
                    date: workout.date 
                };
                personalRecords[nameKey] = newPR;
                prsToSave.push(newPR);
                updated = true;
            }
        });
    });

    if (updated) {
        await Promise.all(prsToSave.map(pr => dbHelper.savePR(pr)));
    }
}

// 6. Loads and displays saved workouts from IndexedDB
async function renderHistory() {
    historyContainerEl.innerHTML = '';
    let history = [];
    
    try {
        history = await dbHelper.getAllWorkouts();
        
    } catch (error) {
        historyContainerEl.innerHTML = `<p class="placeholder-text error-text">Error loading workout history: ${error.message}</p>`;
        return;
    }
    
    if (history.length === 0) {
        historyContainerEl.innerHTML = '<p class="placeholder-text">No workouts saved yet. Finish a session to start tracking your progress.</p>';
        return;
    }

    // --- PR LIST (Top section) ---
    const prHeader = document.createElement('h2');
    prHeader.textContent = 'Personal Records (PRs)';
    historyContainerEl.appendChild(prHeader);

    const prsArray = Object.keys(personalRecords)
        .map(key => ({ name: key, ...personalRecords[key] }))
        .sort((a, b) => b.weight - a.weight); 
    
    if (prsArray.length > 0) {
        prsArray.forEach(pr => {
            const prCard = document.createElement('div');
            prCard.className = 'exercise-card pr-card'; 
            
            const prDate = new Date(pr.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
            
            prCard.innerHTML = `
                <div class="pr-name">${pr.name}</div>
                <div class="pr-details">
                    <span class="pr-weight">${pr.weight} kg</span>
                    <span class="pr-reps">@ ${pr.reps} Reps</span>
                    <span class="pr-date">${prDate}</span>
                </div>
            `;
            historyContainerEl.appendChild(prCard);
        });
    } else {
         historyContainerEl.innerHTML += '<p class="placeholder-text">Complete your first sets to track a PR!</p>';
    }

    // --- WORKOUT HISTORY LIST ---
    const historyHeader = document.createElement('h2');
    historyHeader.textContent = 'Recent History';
    historyContainerEl.appendChild(historyHeader);

    history.slice().reverse().forEach((workout) => {
        const historyCard = document.createElement('div');
        historyCard.className = 'exercise-card'; 
        
        historyCard.innerHTML = `
            <h3>Session: ${new Date(workout.date).toLocaleDateString()}</h3>
            <p style="color:var(--color-text-dim); margin-bottom: 10px;">Exercises: ${workout.exercises.length}</p>
        `;
        
        workout.exercises.forEach(exercise => {
            const exerciseSummary = document.createElement('div');
            exerciseSummary.style.backgroundColor = 'var(--color-dark-bg)';
            exerciseSummary.style.padding = '8px';
            exerciseSummary.style.borderRadius = '4px';
            exerciseSummary.style.marginBottom = '5px';
            
            exerciseSummary.innerHTML = `<p style="margin:0;"><strong>${exercise.name}</strong> - ${exercise.sets.length} Sets</p>`;
            
            historyCard.appendChild(exerciseSummary);
        });

        historyContainerEl.appendChild(historyCard);
    });
}

// NEW FUNCTION: Save rest time setting
function saveRestTimeSetting() {
    const inputEl = document.getElementById('rest-duration-input');
    const newDuration = parseInt(inputEl.value);

    if (isNaN(newDuration) || newDuration < 30 || newDuration > 300) {
        alert("Please enter a rest time between 30 and 300 seconds (5 minutes).");
        inputEl.value = userRestDuration; 
        return;
    }

    userRestDuration = newDuration;
    localStorage.setItem('gainslog_rest_duration', newDuration);
    alert(`Rest timer set to ${newDuration} seconds!`);
}

// NEW FUNCTION: Clear Data Logic (Uses Service Worker with dbHelper fallback)
async function clearAllData() {
    if (!confirm("WARNING: This will permanently delete all saved workouts, routines, and PRs. Are you absolutely sure you want to proceed?")) {
        return;
    }
    
    // 1. Clear LocalStorage items (Routines and Settings) immediately
    localStorage.removeItem('gainslog_routines');
    localStorage.removeItem('gainslog_rest_duration');
    
    // 2. Reset global state immediately
    routines = [];
    personalRecords = {}; 
    userRestDuration = DEFAULT_REST_DURATION;
    currentWorkout.exercises = [];
    
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        try {
            // Wait for the Service Worker to perform the heavy lifting (IndexedDB and Caches)
            await new Promise((resolve, reject) => {
                const sw = navigator.serviceWorker.controller;
                
                const messageHandler = (event) => {
                    if (event.data.action === 'data_cleared') {
                        navigator.serviceWorker.removeEventListener('message', messageHandler);
                        resolve();
                    } else if (event.data.action === 'clear_failed') {
                        navigator.serviceWorker.removeEventListener('message', messageHandler);
                        reject(new Error("Service Worker failed to clear all data."));
                    }
                };
                
                navigator.serviceWorker.addEventListener('message', messageHandler);
                
                // Send the clear message to the Service Worker
                sw.postMessage({ action: 'clear_data' });

                setTimeout(() => {
                    navigator.serviceWorker.removeEventListener('message', messageHandler);
                    reject(new Error("Service Worker message timed out."));
                }, 5000); 
            });

            // 3. Success: All storage is cleared.
            alert("All data successfully cleared. The app will now reload.");
            window.location.reload();

        } catch (error) {
            // 4. Failure: If the SW method fails, fall back to manual IndexedDB clear
            console.error("Service Worker cleanup failed, attempting manual IndexedDB clear:", error);
            try {
                // This call now works because dbHelper.clearAllData is in the class
                await dbHelper.clearAllData(); 
                alert("Data partially cleared, but Service Worker caches may remain. Reloading.");
                window.location.reload();
            } catch (manualError) {
                 console.error("Manual IndexedDB clear also failed:", manualError);
                 alert("Error: Data could not be reliably cleared. Please clear your browser's site data manually.");
            }
        }
    } else {
        // Fallback for no active Service Worker
        await dbHelper.clearAllData(); 
        alert("All data cleared via direct access. Reloading.");
        window.location.reload();
    }
}


// 7. Update stats on the Profile/Settings tab
function updateProfileStats() {
    const totalPRs = Object.keys(personalRecords).length;

    const profileView = document.getElementById('profile-view');
    profileView.innerHTML = `<h2>Profile & Settings</h2>`;

    profileView.innerHTML += `
        <div class="exercise-card" style="margin-top:20px; text-align:center;">
            <h3>User Stats</h3>
            <p style="font-size:3em; color:var(--color-accent-cyan); margin:0;" id="total-workouts-stat">...</p>
            <p style="color:var(--color-text-dim);">Completed Sessions</p>
            
            <p style="font-size:2em; color:var(--color-accent-red); margin-top:15px;">${totalPRs}</p>
            <p style="color:var(--color-text-dim);">PRs Logged</p>
        </div>
        
        <div class="exercise-card settings-card" style="margin-top:20px;">
            <h3>Rest Timer</h3>
            <div class="setting-group">
                <label for="rest-duration-input">Default Rest Time (Seconds)</label>
                <input type="number" id="rest-duration-input" min="30" max="300" 
                       value="${userRestDuration}" onchange="saveRestTimeSetting()">
            </div>
        </div>
        
        <div class="exercise-card settings-card" style="margin-top:20px;">
            <h3>Data Management</h3>
            <button id="clear-all-data-btn" class="primary-btn delete-btn-large">
                <i class="fa-solid fa-trash-can"></i> Clear All App Data
            </button>
        </div>
    `;
    
    document.getElementById('clear-all-data-btn').addEventListener('click', clearAllData);
    
    dbHelper.getAllWorkouts().then(workouts => {
        const totalWorkoutsStatEl = document.getElementById('total-workouts-stat');
        if (totalWorkoutsStatEl) {
            totalWorkoutsStatEl.textContent = workouts.length;
        }
    }).catch(err => {
        console.error("Failed to load workout count for profile:", err);
    });
}


// --- TIMER FUNCTIONS ---

function startRestTimer() {
    clearInterval(timerInterval);
    timeLeft = userRestDuration; 
    
    restTimerEl.classList.remove('timer-hidden');
    
    if ('vibrate' in navigator) {
        navigator.vibrate(200); 
    }

    timerInterval = setInterval(() => {
        timeLeft--;
        updateTimerDisplay();

        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            if ('vibrate' in navigator) {
                navigator.vibrate([200, 100, 200]);
            }
            hideRestTimer(); 
        }
    }, 1000);
}

function updateTimerDisplay() {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    timerDisplayEl.textContent = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

function hideRestTimer() {
    clearInterval(timerInterval);
    restTimerEl.classList.add('timer-hidden');
    timeLeft = userRestDuration; 
    updateTimerDisplay();
}


// --- ROUTINES MANAGEMENT FUNCTIONS ---

function saveRoutines() {
    localStorage.setItem('gainslog_routines', JSON.stringify(routines));
    renderRoutines();
}

function addRoutine() {
    const name = prompt("Enter Routine Name (e.g., 'Push Day', 'Legs'):");
    if (!name) return;

    const newRoutine = {
        id: Date.now(),
        name: name,
        exercises: [] 
    };
    routines.push(newRoutine);
    saveRoutines();
}

function renderRoutines() {
    routinesListEl.innerHTML = '';

    if (routines.length === 0) {
        routinesListEl.innerHTML = '<p class="placeholder-text">Click "Create New Routine" to begin planning.</p>';
        return;
    }

    routines.forEach(routine => {
        const routineCard = document.createElement('div');
        routineCard.className = 'exercise-card'; 
        
        routineCard.innerHTML = `
            <h3>${routine.name} (${routine.exercises.length} Exercises)</h3>
            <p style="color:var(--color-text-dim); margin-bottom: 15px;">
                ${routine.exercises.map(e => e.name).join(', ') || 'No exercises added yet.'}
            </p>
            <button class="secondary-btn" onclick="editRoutineExercises(${routine.id})">Edit Exercises</button>
            <button class="secondary-btn" onclick="loadRoutine(${routine.id})" style="background-color: #2ECC71;">Start Routine</button>
            <button class="secondary-btn delete-btn" onclick="deleteRoutine(${routine.id})">Delete Routine</button>
        `;
        routinesListEl.appendChild(routineCard);
    });
}

function deleteRoutine(routineId) {
    if (confirm("Are you sure you want to delete this routine?")) {
        routines = routines.filter(r => r.id !== routineId);
        saveRoutines();
    }
}

function loadRoutine(routineId) {
    const routine = routines.find(r => r.id === routineId);
    if (!routine) return;

    if (currentWorkout.exercises.length > 0) {
        if (!confirm("Starting a new routine will clear your current session. Continue?")) {
            return;
        }
    }
    
    currentWorkout.exercises = JSON.parse(JSON.stringify(routine.exercises));

    currentWorkout.exercises.forEach(exercise => {
        exercise.id = Date.now() + Math.random();
        exercise.sets.forEach(set => {
            set.completed = false;
        });
    });

    renderCurrentWorkout();
    alert(`Routine "${routine.name}" loaded!`);

    document.querySelector('.tab-button[data-view="current"]').click();
}

// --- ROUTINE EDITOR MODAL FUNCTIONS ---

function editRoutineExercises(routineId) {
    editingRoutineId = routineId;
    const routine = routines.find(r => r.id === routineId);
    if (!routine) return;

    routineEditorTitle.textContent = `Editing Routine: ${routine.name}`;
    routineEditorView.classList.remove('hidden');

    renderRoutineEditorList(routine);
}

function renderRoutineEditorList(routine) {
    routineEditorList.innerHTML = '';
    
    if (routine.exercises.length === 0) {
        routineEditorList.innerHTML = '<p class="placeholder-text">Click "Add Exercise" below to start building your template.</p>';
        return;
    }

    routine.exercises.forEach(exercise => {
        const item = document.createElement('div');
        item.className = 'routine-template-exercise';
        item.innerHTML = `
            <span>${exercise.name} (${exercise.sets.length} Sets)</span>
            <button class="delete-btn" data-exercise-id="${exercise.id}">Remove</button>
        `;
        routineEditorList.appendChild(item);
    });
}

function addExerciseToTemplate() {
    const routine = routines.find(r => r.id === editingRoutineId);
    if (!routine) return;

    const name = prompt("Enter Exercise Name for the template:");
    if (!name) return;
    
    const newExerciseTemplate = {
        id: Date.now() + Math.random(), 
        name: name,
        sets: [
            { setNumber: 1, weight: '100', reps: '10', completed: false },
            { setNumber: 2, weight: '100', reps: '10', completed: false },
            { setNumber: 3, weight: '100', reps: '10', completed: false }
        ]
    };
    routine.exercises.push(newExerciseTemplate);
    saveRoutines(); 
    renderRoutineEditorList(routine); 
}

function closeRoutineEditor() {
    editingRoutineId = null;
    routineEditorView.classList.add('hidden');
    renderRoutines(); 
}


// --- EVENT LISTENERS AND INITIALIZATION ---

// New asynchronous initialization function
async function initApp() {
    try {
        // 1. Open the database
        await dbHelper.openDB();
        
        // 2. Load PRs from IndexedDB into the global state for comparison
        const savedPRsArray = await dbHelper.getAllPRs();
        savedPRsArray.forEach(pr => {
            personalRecords[pr.name] = pr;
        });

        // 3. Tab switching 
        tabButtons.forEach(tab => {
            tab.addEventListener('click', () => {
                const index = parseInt(tab.getAttribute('data-index'));
                switchPage(index);
            });
        });

        // 4. Swipe/Touch Listeners
        swipeWrapperEl.addEventListener('touchstart', handleTouchStart);
        swipeWrapperEl.addEventListener('touchmove', handleTouchMove);
        swipeWrapperEl.addEventListener('touchend', handleTouchEnd);
        swipeWrapperEl.addEventListener('touchmove', (e) => {
            if (e.target.closest('#workout-history-container') || e.target.closest('#routines-list-container')) {
                return; 
            }
            e.preventDefault(); 
        }, { passive: false });

        // 5. Button Listeners
        addExerciseBtn.addEventListener('click', addExercise);
        finishWorkoutBtn.addEventListener('click', finishAndSaveWorkout);
        skipTimerBtn.addEventListener('click', hideRestTimer);
        addRoutineBtn.addEventListener('click', addRoutine);
        
        // 6. Routine Editor Buttons
        addExerciseToRoutineBtn.addEventListener('click', addExerciseToTemplate);
        closeEditorBtn.addEventListener('click', closeRoutineEditor);

        // 7. Delegated Listener for Input changes
        exerciseListEl.addEventListener('change', (e) => {
            if (e.target.tagName === 'INPUT' && e.target.type === 'number') {
                const input = e.target;
                const cardEl = input.closest('.exercise-card');
                const exerciseId = parseFloat(cardEl.querySelector('.management-btn').dataset.exerciseId);
                const setNumber = parseInt(input.getAttribute('data-set-id'));
                const field = input.getAttribute('data-field');

                const exercise = currentWorkout.exercises.find(e => e.id === exerciseId);
                if (exercise) {
                    const set = exercise.sets.find(s => s.setNumber === setNumber);
                    if (set) {
                        set[field] = input.value;
                    }
                }
            }
        });
        
        // 8. Delegated Listener for Set Completion (Tap-to-Track Logic)
        exerciseListEl.addEventListener('click', (e) => {
            if (e.target.classList.contains('set-status')) {
                const statusEl = e.target;
                const exerciseId = parseFloat(statusEl.dataset.exerciseId);
                const setNumber = parseInt(statusEl.dataset.setNumber);

                const exercise = currentWorkout.exercises.find(e => e.id === exerciseId);
                if (!exercise) return;
                const set = exercise.sets.find(s => s.setNumber === setNumber);
                if (!set) return;

                set.completed = !set.completed;
                statusEl.classList.toggle('completed', set.completed);
                
                const setRow = statusEl.closest('.set-row');
                const weightInput = setRow.querySelector('input[data-field="weight"]');
                const repsInput = setRow.querySelector('input[data-field="reps"]');

                if (set.completed) {
                    const prevSet = exercise.sets.find(s => s.setNumber === setNumber - 1);
                    
                    if (!weightInput.value && prevSet) {
                        weightInput.value = prevSet.weight;
                    }
                    if (!repsInput.value && prevSet) {
                        repsInput.value = prevSet.reps;
                    }

                    set.weight = weightInput.value;
                    set.reps = repsInput.value;
                    
                    if (set.setNumber === exercise.sets.length) {
                        addSetToExercise(exercise.id);
                    }
                    
                    startRestTimer();

                } else {
                    set.weight = '';
                    set.reps = '';
                    hideRestTimer(); 
                }
            }
        });
        
        // 9. Delegated Listener for Management Menu Toggle
        exerciseListEl.addEventListener('click', (e) => {
            if (e.target.classList.contains('management-btn')) {
                const exerciseId = e.target.dataset.exerciseId;
                document.querySelectorAll('.management-menu').forEach(menu => {
                    if(menu.id !== `menu-${exerciseId}`) menu.classList.add('hidden');
                });
                const menuEl = document.getElementById(`menu-${exerciseId}`);
                menuEl.classList.toggle('hidden');
            }
        });
        
        // 10. Delegated Listener for deleting template exercises
        routineEditorList.addEventListener('click', (e) => {
            if (e.target.classList.contains('delete-btn')) {
                const exerciseTemplateId = parseFloat(e.target.dataset.exerciseId);
                const routine = routines.find(r => r.id === editingRoutineId);

                if (routine && confirm("Remove this exercise from the routine template?")) {
                    routine.exercises = routine.exercises.filter(e => e.id !== exerciseTemplateId);
                    saveRoutines();
                    renderRoutineEditorList(routine);
                }
            }
        });

        // 11. Initial render when the app loads
        switchPage(0); 
        updateProfileStats();
        
    } catch (error) {
        console.error("Fatal Error during app initialization:", error);
        alert("The app failed to load its data storage. Please check your browser's console.");
    }
}

document.addEventListener('DOMContentLoaded', initApp);
