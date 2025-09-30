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

// Global State for saved routines (stored in LocalStorage)
let routines = JSON.parse(localStorage.getItem('gainslog_routines') || '[]');
let editingRoutineId = null; 

// Global Timer Variables
const REST_DURATION = 90; // Default rest time in seconds (1.5 minutes)
let timerInterval;
let timeLeft = REST_DURATION;


// Element references (Current Workout View)
const exerciseListEl = document.getElementById('exercise-list');
const addExerciseBtn = document.getElementById('add-exercise-btn');
const finishWorkoutBtn = document.getElementById('finish-workout-btn');
const restTimerEl = document.getElementById('rest-timer');
const timerDisplayEl = document.getElementById('timer-display');
const skipTimerBtn = document.getElementById('skip-timer-btn');

// Element references (History View)
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


// 2. Generates the HTML for the Current Session (Including Edit/Delete)
function renderCurrentWorkout() {
    exerciseListEl.innerHTML = ''; 

    if (currentWorkout.exercises.length === 0) {
        exerciseListEl.innerHTML = '<p class="placeholder-text">Click "Add New Exercise" or load a Routine to start your session.</p>';
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
            
            // 1. Set Number (15% width)
            setRow.innerHTML += `<span class="set-number">${set.setNumber}</span>`;
            
            // 2. Weight Input Group (35% width)
            setRow.innerHTML += `
                <div class="input-group">
                    <span class="input-label">Weight (kg)</span>
                    <input type="number" data-set-id="${set.setNumber}" data-field="weight" 
                           value="${set.weight}" placeholder="100" inputmode="decimal">
                </div>`;
            
            // 3. Reps Input Group (35% width)
            setRow.innerHTML += `
                <div class="input-group">
                    <span class="input-label">Reps</span>
                    <input type="number" data-set-id="${set.setNumber}" data-field="reps" 
                           value="${set.reps}" placeholder="10" inputmode="numeric">
                </div>`;
            
            // 4. Completion Circle (15% width)
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

    let history = JSON.parse(localStorage.getItem('gainslog_history') || '[]');
    history.push(currentWorkout);
    localStorage.setItem('gainslog_history', JSON.stringify(history));

    currentWorkout = {
        date: new Date().toISOString().slice(0, 10),
        exercises: []
    };
    alert(`Workout saved successfully for ${history.length} total sessions!`);
    renderCurrentWorkout(); 
    renderHistory();
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


// --- HISTORY FUNCTIONS ---

// 6. Loads and displays saved workouts
function renderHistory() {
    const history = JSON.parse(localStorage.getItem('gainslog_history') || '[]');
    historyContainerEl.innerHTML = '';
    
    if (history.length === 0) {
        historyContainerEl.innerHTML = '<p class="placeholder-text">No workouts saved yet. Finish a session to see history here.</p>';
        return;
    }

    history.slice().reverse().forEach((workout, index) => {
        const historyCard = document.createElement('div');
        historyCard.className = 'exercise-card'; 
        
        historyCard.innerHTML = `
            <h3>Session Date: ${new Date(workout.date).toLocaleDateString()}</h3>
            <p style="color:var(--color-text-dim); margin-bottom: 10px;">Exercises logged: ${workout.exercises.length}</p>
        `;
        
        workout.exercises.forEach(exercise => {
            const exerciseSummary = document.createElement('div');
            exerciseSummary.innerHTML = `<p><strong>${exercise.name}</strong> (${exercise.sets.length} Sets)</p>`;
            
            const setList = document.createElement('ul');
            setList.style.listStyleType = 'none';
            setList.style.paddingLeft = '10px';
            setList.style.fontSize = '0.9em';

            exercise.sets.forEach(set => {
                if (set.completed && set.weight && set.reps) { 
                     setList.innerHTML += `
                        <li>Set ${set.setNumber}: ${set.weight}kg x ${set.reps} reps</li>
                    `;
                }
            });

            historyCard.appendChild(exerciseSummary);
            historyCard.appendChild(setList);
        });

        historyContainerEl.appendChild(historyCard);
    });
}


// --- TIMER FUNCTIONS ---

function startRestTimer() {
    clearInterval(timerInterval);
    timeLeft = REST_DURATION;
    
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
            // FIX: Hide timer immediately when rest is over
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
    timeLeft = REST_DURATION;
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
        routineEditorList.innerHTML = '<p class="placeholder-text">No exercises in this routine yet.</p>';
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
    const tabs = document.querySelectorAll('.tab-button');
    const views = document.querySelectorAll('.view');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetViewId = tab.getAttribute('data-view') + '-view';

            // Hide the editor modal before switching tabs
            routineEditorView.classList.add('hidden'); 
            
            tabs.forEach(t => t.classList.remove('active'));
            views.forEach(v => v.classList.add('hidden'));

            tab.classList.add('active');
            const targetView = document.getElementById(targetViewId);
            if (targetView) {
                targetView.classList.remove('hidden');
                
                // Render content when tabs are switched
                if (tab.getAttribute('data-view') === 'history') {
                    renderHistory();
                } 
                if (tab.getAttribute('data-view') === 'routines') {
                    renderRoutines();
                }
                // FIX: Force re-render of the Current Workout view when returning to it
                if (tab.getAttribute('data-view') === 'current') {
                    renderCurrentWorkout(); 
                }
            }
        });
    });

    // 2. Button Listeners
    addExerciseBtn.addEventListener('click', addExercise);
    finishWorkoutBtn.addEventListener('click', finishAndSaveWorkout);
    skipTimerBtn.addEventListener('click', hideRestTimer);
    addRoutineBtn.addEventListener('click', addRoutine);
    
    // 3. Routine Editor Buttons
    addExerciseToRoutineBtn.addEventListener('click', addExerciseToTemplate);
    closeEditorBtn.addEventListener('click', closeRoutineEditor);

    // 4. Delegated Listener for Input changes
    exerciseListEl.addEventListener('change', (e) => {
        if (e.target.tagName === 'INPUT' && e.target.type === 'number') {
            const input = e.target;
            const cardEl = input.closest('.exercise-card');
            const exerciseName = cardEl.querySelector('h3').textContent; 
            const setNumber = parseInt(input.getAttribute('data-set-id'));
            const field = input.getAttribute('data-field');

            const exercise = currentWorkout.exercises.find(e => e.name === exerciseName);
            if (exercise) {
                const set = exercise.sets.find(s => s.setNumber === setNumber);
                if (set) {
                    set[field] = input.value;
                }
            }
        }
    });
    
    // 5. Delegated Listener for Set Completion (Tap-to-Track Logic)
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

            if (set.completed) {
                const setRow = statusEl.closest('.set-row');
                const weightInput = setRow.querySelector('input[data-field="weight"]');
                const repsInput = setRow.querySelector('input[data-field="reps"]');
                const prevSet = exercise.sets.find(s => s.setNumber === setNumber - 1);
                
                // Auto-Fill Logic
                if (!weightInput.value && prevSet) {
                    weightInput.value = prevSet.weight;
                    set.weight = prevSet.weight; 
                }
                if (!repsInput.value && prevSet) {
                    repsInput.value = prevSet.reps;
                    set.reps = prevSet.reps; 
                }

                // Log Data
                set.weight = weightInput.value;
                set.reps = repsInput.value;
                
                // Auto-Advance
                if (set.setNumber === exercise.sets.length) {
                    addSetToExercise(exercise.id);
                }
                
                // Start Timer
                startRestTimer();

            } else {
                set.weight = '';
                set.reps = '';
                hideRestTimer(); 
            }
        }
    });
    
    // 6. Delegated Listener for Management Menu Toggle
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
    
    // 7. Delegated Listener for deleting template exercises
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
    renderCurrentWorkout();
});
