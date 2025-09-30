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
    date: new Date().toISOString().slice(0, 10), // YYYY-MM-DD
    exercises: []
};

// Global State for saved routines and PRs
let routines = JSON.parse(localStorage.getItem('gainslog_routines') || '[]');
let personalRecords = JSON.parse(localStorage.getItem('gainslog_prs') || '{}'); 
let editingRoutineId = null; 

// Global Timer Variables
const DEFAULT_REST_DURATION = 90; // Fallback rest time in seconds (1.5 minutes)
// Load user preference, defaulting to 90 seconds if not set
let userRestDuration = parseInt(localStorage.getItem('gainslog_rest_duration')) || DEFAULT_REST_DURATION; 

let timerInterval;
let timeLeft = userRestDuration; 

// SWIPE/NAVIGATION STATE
let currentTabIndex = 0; // 0: Training, 1: Progress, 2: Routines, 3: Profile
let startX = 0;
const SWIPE_THRESHOLD = 50; // Minimum pixel distance for a successful swipe


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
    // Hide the editor modal before switching tabs
    routineEditorView.classList.add('hidden'); 

    // Ensure index is within bounds (0 to 3)
    index = Math.max(0, Math.min(3, index));
    currentTabIndex = index;
    
    // 1. Visually slide the wrapper
    const translateValue = index * -100;
    swipeWrapperEl.style.transform = `translateX(${translateValue}vw)`;

    // 2. Update Tab Buttons (Highlight the active tab)
    tabButtons.forEach(btn => {
        btn.classList.remove('active');
        if (parseInt(btn.dataset.index) === index) {
            btn.classList.add('active');
        }
    });

    // 3. Render content for the active view
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
    swipeWrapperEl.style.transition = 'none'; // Disable transition during drag
}

function handleTouchMove(e) {
    const currentX = e.touches[0].clientX;
    const diff = currentX - startX;
    
    // Only allow manual drag for the first three views (0, 1, 2)
    if (currentTabIndex < 3) {
        // Calculate the current base offset in pixels
        const baseOffset = currentTabIndex * window.innerWidth;
        
        // Calculate the new drag position and set transform
        swipeWrapperEl.style.transform = `translateX(${(-baseOffset + diff)}px)`;
    }
}

function handleTouchEnd(e) {
    const endX = e.changedTouches[0].clientX;
    const diff = endX - startX;
    
    swipeWrapperEl.style.transition = 'transform 0.3s ease-out'; // Re-enable transition

    if (currentTabIndex >= 3) {
        // If on the last (non-swipeable) page, snap back immediately
        switchPage(currentTabIndex);
        return;
    }
    
    if (diff > SWIPE_THRESHOLD && currentTabIndex > 0) {
        // Swipe Right (Go Previous)
        switchPage(currentTabIndex - 1);
    } else if (diff < -SWIPE_THRESHOLD && currentTabIndex < 2) {
        // Swipe Left (Go Next, only up to index 2 (Routines))
        switchPage(currentTabIndex + 1);
    } else {
        // Not enough swipe, snap back to current page
        switchPage(currentTabIndex);
    }
}


// --- CORE WORKOUT FUNCTIONS ---

// 1. Adds a New Exercise to the Current Session
function addExercise() {
    const name = prompt("Enter Exercise Name (e.g., Squats, Bench Press):");
    if (!name) return;

    const newExercise = {
        id: Date.now(),
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
            weight: prevSet.weight, // Auto-fill weight
            reps: prevSet.reps,     // Auto-fill reps
            completed: false
        });
        renderCurrentWorkout(); 
    }
}

// 4. Handles saving workout data to LocalStorage
function finishAndSaveWorkout() {
    if (currentWorkout.exercises.length === 0) {
        alert("Cannot save an empty workout!");
        return;
    }

    // 1. Update Personal Records before saving history
    updatePersonalRecords(currentWorkout);

    // 2. Save history
    let history = JSON.parse(localStorage.getItem('gainslog_history') || '[]');
    history.push(currentWorkout);
    localStorage.setItem('gainslog_history', JSON.stringify(history));

    // 3. Reset state
    currentWorkout = {
        date: new Date().toISOString().slice(0, 10),
        exercises: []
    };
    alert(`Workout saved successfully!`);
    renderCurrentWorkout(); 
    
    // 4. Update UI views
    renderHistory(); // Update Progress view
    updateProfileStats(); // Update Profile view
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

// Compares completed sets in the current workout to saved PRs
function updatePersonalRecords(workout) {
    let updated = false;

    workout.exercises.forEach(exercise => {
        const nameKey = exercise.name.toUpperCase();
        
        exercise.sets.filter(s => s.completed && s.weight && s.reps).forEach(set => {
            const setWeight = parseFloat(set.weight);
            const setReps = parseInt(set.reps);

            // PRs are stored as an object { ExerciseName: { weight: X, date: Y } }
            if (!personalRecords[nameKey] || setWeight > personalRecords[nameKey].weight) {
                
                // New Weight PR
                personalRecords[nameKey] = {
                    weight: setWeight,
                    reps: setReps,
                    date: workout.date 
                };
                updated = true;
                
            } else if (setWeight === personalRecords[nameKey].weight && setReps > personalRecords[nameKey].reps) {
                
                // Rep PR at the same maximum weight
                personalRecords[nameKey].reps = setReps;
                personalRecords[nameKey].date = workout.date;
                updated = true;
            }
        });
    });

    if (updated) {
        localStorage.setItem('gainslog_prs', JSON.stringify(personalRecords));
    }
}

// 6. Loads and displays saved workouts (now used for the Progress tab)
function renderHistory() {
    const history = JSON.parse(localStorage.getItem('gainslog_history') || '[]');
    historyContainerEl.innerHTML = '';
    
    if (history.length === 0) {
        historyContainerEl.innerHTML = '<p class="placeholder-text">No workouts saved yet. Finish a session to start tracking your progress.</p>';
        return;
    }

    // --- PR LIST (Top section) ---
    const prHeader = document.createElement('h2');
    prHeader.textContent = 'Personal Records (PRs)';
    historyContainerEl.appendChild(prHeader);

    // Filter and sort PRs for display
    const prsArray = Object.keys(personalRecords)
        .map(key => ({ name: key, ...personalRecords[key] }))
        .sort((a, b) => b.weight - a.weight); // Sort by heaviest weight
    
    if (prsArray.length > 0) {
        prsArray.forEach(pr => {
            const prCard = document.createElement('div');
            prCard.className = 'exercise-card pr-card'; // Use new class for styling
            
            // Format the date nicely
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
            // Use the dark background for a clean line
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
        inputEl.value = userRestDuration; // Reset input to current valid value
        return;
    }

    userRestDuration = newDuration;
    localStorage.setItem('gainslog_rest_duration', newDuration);
    alert(`Rest timer set to ${newDuration} seconds!`);
}

// NEW FUNCTION: Clear Data Logic
function clearAllData() {
    if (confirm("WARNING: This will permanently delete all saved workouts, routines, and PRs. Are you absolutely sure you want to proceed?")) {
        localStorage.removeItem('gainslog_history');
        localStorage.removeItem('gainslog_prs');
        localStorage.removeItem('gainslog_routines');
        localStorage.removeItem('gainslog_rest_duration');
        
        // Reset global state
        routines = [];
        personalRecords = {};
        userRestDuration = DEFAULT_REST_DURATION;
        currentWorkout.exercises = [];
        
        alert("All data successfully cleared. The app will now reload.");
        window.location.reload();
    }
}


// 7. Update stats on the Profile/Settings tab
function updateProfileStats() {
    const history = JSON.parse(localStorage.getItem('gainslog_history') || '[]');
    const totalWorkouts = history.length;
    const totalPRs = Object.keys(personalRecords).length;

    // Custom content for the Profile view
    const profileView = document.getElementById('profile-view');
    profileView.innerHTML = `<h2>Profile & Settings</h2>`;

    profileView.innerHTML += `
        <div class="exercise-card" style="margin-top:20px; text-align:center;">
            <h3>User Stats</h3>
            <p style="font-size:3em; color:var(--color-accent-cyan); margin:0;">${totalWorkouts}</p>
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
    
    // Attach listener for the Clear Data Button (must be done after innerHTML is set)
    document.getElementById('clear-all-data-btn').addEventListener('click', clearAllData);
}


// --- TIMER FUNCTIONS ---

function startRestTimer() {
    clearInterval(timerInterval);
    // Use the currently configured duration
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
    timeLeft = userRestDuration; // Reset to the user's default
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
    
    // Deep copy the routine exercises to the current workout session
    currentWorkout.exercises = JSON.parse(JSON.stringify(routine.exercises));

    // Clear completion status and reset IDs for the new session
    currentWorkout.exercises.forEach(exercise => {
        exercise.id = Date.now() + Math.random();
        exercise.sets.forEach(set => {
            set.completed = false;
        });
    });

    renderCurrentWorkout();
    alert(`Routine "${routine.name}" loaded!`);

    // Switch to the current workout view
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
    
    // Default template: 3 sets @ 100kg x 10 reps
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

document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Tab switching 
    tabButtons.forEach(tab => {
        tab.addEventListener('click', () => {
            const index = parseInt(tab.getAttribute('data-index'));
            switchPage(index);
        });
    });

    // 2. Swipe/Touch Listeners
    swipeWrapperEl.addEventListener('touchstart', handleTouchStart);
    swipeWrapperEl.addEventListener('touchmove', handleTouchMove);
    swipeWrapperEl.addEventListener('touchend', handleTouchEnd);
    // Add a simple listener to prevent swiping on scrollable content
    swipeWrapperEl.addEventListener('touchmove', (e) => {
        if (e.target.closest('#workout-history-container') || e.target.closest('#routines-list-container')) {
            // Allows scrolling within these elements to override horizontal swipe
            return; 
        }
        e.preventDefault(); 
    }, { passive: false });

    // 3. Button Listeners
    addExerciseBtn.addEventListener('click', addExercise);
    finishWorkoutBtn.addEventListener('click', finishAndSaveWorkout);
    skipTimerBtn.addEventListener('click', hideRestTimer);
    addRoutineBtn.addEventListener('click', addRoutine);
    
    // 4. Routine Editor Buttons
    addExerciseToRoutineBtn.addEventListener('click', addExerciseToTemplate);
    closeEditorBtn.addEventListener('click', closeRoutineEditor);

    // 5. Delegated Listener for Input changes
    exerciseListEl.addEventListener('change', (e) => {
        if (e.target.tagName === 'INPUT' && e.target.type === 'number') {
            const input = e.target;
            const cardEl = input.closest('.exercise-card');
            // Use the data-exercise-id from the management button to reliably find the exercise
            const exerciseId = parseInt(cardEl.querySelector('.management-btn').dataset.exerciseId);
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
    
    // 6. Delegated Listener for Set Completion (Tap-to-Track Logic)
    exerciseListEl.addEventListener('click', (e) => {
        if (e.target.classList.contains('set-status')) {
            const statusEl = e.target;
            const exerciseId = parseInt(statusEl.dataset.exerciseId);
            const setNumber = parseInt(statusEl.dataset.setNumber);

            const exercise = currentWorkout.exercises.find(e => e.id === exerciseId);
            if (!exercise) return;
            const set = exercise.sets.find(s => s.setNumber === setNumber);
            if (!set) return;

            set.completed = !set.completed;
            statusEl.classList.toggle('completed', set.completed);
            
            // Ensure inputs are logged before any action
            const setRow = statusEl.closest('.set-row');
            const weightInput = setRow.querySelector('input[data-field="weight"]');
            const repsInput = setRow.querySelector('input[data-field="reps"]');

            if (set.completed) {
                const prevSet = exercise.sets.find(s => s.setNumber === setNumber - 1);
                
                // Auto-Fill Logic
                if (!weightInput.value && prevSet) {
                    weightInput.value = prevSet.weight;
                }
                if (!repsInput.value && prevSet) {
                    repsInput.value = prevSet.reps;
                }

                // Log Data immediately after auto-fill
                set.weight = weightInput.value;
                set.reps = repsInput.value;
                
                // Auto-Advance
                if (set.setNumber === exercise.sets.length) {
                    addSetToExercise(exercise.id);
                }
                
                // Start Timer
                startRestTimer();

            } else {
                // If uncompleted, clear data and stop timer
                set.weight = '';
                set.reps = '';
                hideRestTimer(); 
            }
        }
    });
    
    // 7. Delegated Listener for Management Menu Toggle
    exerciseListEl.addEventListener('click', (e) => {
        if (e.target.classList.contains('management-btn')) {
            const exerciseId = e.target.dataset.exerciseId;
            // Hide all other menus
            document.querySelectorAll('.management-menu').forEach(menu => {
                if(menu.id !== `menu-${exerciseId}`) menu.classList.add('hidden');
            });
            // Toggle the target menu
            const menuEl = document.getElementById(`menu-${exerciseId}`);
            menuEl.classList.toggle('hidden');
        }
    });
    
    // 8. Delegated Listener for deleting template exercises
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


    // Initial render when the app loads
    switchPage(0); // Start on the Training (index 0) page
    updateProfileStats();
});
