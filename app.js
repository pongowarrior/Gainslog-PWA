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

// Global State Object for the current workout session
let currentWorkout = {
    date: new Date().toISOString().slice(0, 10), // YYYY-MM-DD
    exercises: []
};

// Global Timer Variables
const REST_DURATION = 90; // Default rest time in seconds (1.5 minutes)
let timerInterval;
let timeLeft = REST_DURATION;


// Element references
const exerciseListEl = document.getElementById('exercise-list');
const addExerciseBtn = document.getElementById('add-exercise-btn');
const finishWorkoutBtn = document.getElementById('finish-workout-btn');
const historyContainerEl = document.getElementById('workout-history-container');
const restTimerEl = document.getElementById('rest-timer');
const timerDisplayEl = document.getElementById('timer-display');
const skipTimerBtn = document.getElementById('skip-timer-btn');


// --- CORE WORKOUT FUNCTIONS ---

// 1. Adds a New Exercise to the Current Session
function addExercise() {
    // Prompt the user for the exercise name
    const name = prompt("Enter Exercise Name (e.g., Squats, Bench Press):");
    if (!name) return; // User cancelled

    const newExercise = {
        id: Date.now(),
        name: name,
        sets: [
            { setNumber: 1, weight: '', reps: '', completed: false }
        ]
    };
    currentWorkout.exercises.push(newExercise);
    
    // Rerender the entire list to show the new exercise
    renderCurrentWorkout();

    // Show the Finish button once an exercise is added
    finishWorkoutBtn.classList.remove('hidden');
}


// 2. Generates the HTML for the Current Session
function renderCurrentWorkout() {
    // Clear existing content
    exerciseListEl.innerHTML = ''; 

    if (currentWorkout.exercises.length === 0) {
        exerciseListEl.innerHTML = '<p class="placeholder-text">Click "Add New Exercise" to start your session.</p>';
        finishWorkoutBtn.classList.add('hidden');
        return;
    }

    currentWorkout.exercises.forEach(exercise => {
        const card = document.createElement('div');
        card.className = 'exercise-card';
        card.innerHTML = `<h3>${exercise.name}</h3>`;
        
        exercise.sets.forEach(set => {
            const setRow = document.createElement('div');
            setRow.className = 'set-row';
            
            // 1. Set Number (15% width)
            setRow.innerHTML += `<span class="set-number">${set.setNumber}</span>`;
            
            // 2. Weight Input Group (35% width) - Uses new mobile-friendly structure
            setRow.innerHTML += `
                <div class="input-group">
                    <span class="input-label">Weight (kg)</span>
                    <input type="number" data-set-id="${set.setNumber}" data-field="weight" 
                           value="${set.weight}" placeholder="100" inputmode="decimal">
                </div>`;
            
            // 3. Reps Input Group (35% width) - Uses new mobile-friendly structure
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
        exercise.sets.push({
            setNumber: newSetNumber,
            weight: '',
            reps: '',
            completed: false
        });
        renderCurrentWorkout(); // Refresh the display
    }
}

// 4. Handles saving workout data to LocalStorage
function finishAndSaveWorkout() {
    if (currentWorkout.exercises.length === 0) {
        alert("Cannot save an empty workout!");
        return;
    }

    // 1. Get all saved history
    let history = JSON.parse(localStorage.getItem('ironlog_history') || '[]');
    
    // 2. Add current workout to history
    history.push(currentWorkout);
    
    // 3. Save updated history back to LocalStorage
    localStorage.setItem('ironlog_history', JSON.stringify(history));

    // 4. Reset the current session for a new workout
    currentWorkout = {
        date: new Date().toISOString().slice(0, 10),
        exercises: []
    };
    alert(`Workout saved successfully for ${history.length} total sessions!`);
    renderCurrentWorkout(); // Clear the screen
    renderHistory(); // Refresh the history view
}


// 5. Loads and displays saved workouts
function renderHistory() {
    const history = JSON.parse(localStorage.getItem('ironlog_history') || '[]');
    historyContainerEl.innerHTML = '';
    
    if (history.length === 0) {
        historyContainerEl.innerHTML = '<p class="placeholder-text">No workouts saved yet. Finish a session to see history here.</p>';
        return;
    }

    // Display history in reverse chronological order
    history.slice().reverse().forEach((workout, index) => {
        const historyCard = document.createElement('div');
        historyCard.className = 'exercise-card'; 
        
        // Display the date and total exercises
        historyCard.innerHTML = `
            <h3>Session Date: ${new Date(workout.date).toLocaleDateString()}</h3>
            <p style="color:var(--color-text-dim); margin-bottom: 10px;">Exercises logged: ${workout.exercises.length}</p>
        `;
        
        // List the exercises in the session
        workout.exercises.forEach(exercise => {
            const exerciseSummary = document.createElement('div');
            // Bold the exercise name
            exerciseSummary.innerHTML = `
                <p><strong>${exercise.name}</strong> (${exercise.sets.length} Sets)</p>
            `;
            
            // List the sets (e.g., 3x100kg @ 10 reps)
            const setList = document.createElement('ul');
            setList.style.listStyleType = 'none';
            setList.style.paddingLeft = '10px';
            setList.style.fontSize = '0.9em';

            exercise.sets.forEach(set => {
                // Only show completed sets that have data
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
    // 1. Reset timer state
    clearInterval(timerInterval);
    timeLeft = REST_DURATION;
    
    // 2. Display the timer UI
    restTimerEl.classList.remove('timer-hidden');
    
    // 3. Optional: Vibrate phone to notify user rest has started
    if ('vibrate' in navigator) {
        navigator.vibrate(200); 
    }

    // 4. Start the countdown interval
    timerInterval = setInterval(() => {
        timeLeft--;
        updateTimerDisplay();

        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            // Optional: Vibrate/play sound when rest is finished
            if ('vibrate' in navigator) {
                navigator.vibrate([200, 100, 200]);
            }
            // Auto-hide after 5 seconds
            setTimeout(hideRestTimer, 5000); 
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
    timeLeft = REST_DURATION; // Reset for next use
    updateTimerDisplay(); // Reset the display to 1:30
}


// --- EVENT LISTENERS AND INITIALIZATION ---

document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Tab switching 
    const tabs = document.querySelectorAll('.tab-button');
    const views = document.querySelectorAll('.view');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetViewId = tab.getAttribute('data-view') + '-view';

            tabs.forEach(t => t.classList.remove('active'));
            views.forEach(v => v.classList.add('hidden'));

            tab.classList.add('active');
            const targetView = document.getElementById(targetViewId);
            if (targetView) {
                targetView.classList.remove('hidden');
                
                // If History tab is clicked, refresh history view
                if (tab.getAttribute('data-view') === 'history') {
                    renderHistory();
                }
            }
        });
    });

    // 2. Add Exercise Button
    addExerciseBtn.addEventListener('click', addExercise);

    // 3. Finish Workout Button
    finishWorkoutBtn.addEventListener('click', finishAndSaveWorkout);
    
    // 4. Skip Rest Button
    skipTimerBtn.addEventListener('click', hideRestTimer);
    
    // 5. Delegated Event Listener for Dynamic Elements (Inputs and Status Circles)
    exerciseListEl.addEventListener('change', (e) => {
        // Handle input changes (Weight/Reps)
        if (e.target.tagName === 'INPUT' && e.target.type === 'number') {
            const input = e.target;
            const cardEl = input.closest('.exercise-card');
            const exerciseName = cardEl.querySelector('h3').textContent; 
            const setNumber = parseInt(input.getAttribute('data-set-id'));
            const field = input.getAttribute('data-field');

            // Find the exercise and update the data
            const exercise = currentWorkout.exercises.find(e => e.name === exerciseName);
            if (exercise) {
                const set = exercise.sets.find(s => s.setNumber === setNumber);
                if (set) {
                    set[field] = input.value;
                }
            }
        }
    });
    
    exerciseListEl.addEventListener('click', (e) => {
        // Handle Set Status Click (Completion Circle)
        if (e.target.classList.contains('set-status')) {
            const statusEl = e.target;
            const exerciseId = parseInt(statusEl.dataset.exerciseId);
            const setNumber = parseInt(statusEl.dataset.setNumber);

            // Find the exercise and set
            const exercise = currentWorkout.exercises.find(e => e.id === exerciseId);
            if (!exercise) return;
            const set = exercise.sets.find(s => s.setNumber === setNumber);
            if (!set) return;

            // TOGGLE COMPLETION STATE
            set.completed = !set.completed;
            statusEl.classList.toggle('completed', set.completed);

            if (set.completed) {
                // --- Tap-to-Track Logic ---
                const setRow = statusEl.closest('.set-row');
                const weightInput = setRow.querySelector('input[data-field="weight"]');
                const repsInput = setRow.querySelector('input[data-field="reps"]');
                const prevSet = exercise.sets.find(s => s.setNumber === setNumber - 1);
                
                // 1. Auto-Fill Logic: If inputs are empty, use previous set's values
                if (!weightInput.value && prevSet) {
                    weightInput.value = prevSet.weight;
                    set.weight = prevSet.weight; // Update state
                }
                if (!repsInput.value && prevSet) {
                    repsInput.value = prevSet.reps;
                    set.reps = prevSet.reps; // Update state
                }

                // 2. Log Data: Capture the final values into the state object (in case user entered them)
                set.weight = weightInput.value;
                set.reps = repsInput.value;
                
                // 3. Auto-Advance: Automatically add a new, empty set row 
                //    if the user just completed the LAST set in the list.
                if (set.setNumber === exercise.sets.length) {
                    addSetToExercise(exercise.id);
                }
                
                // 4. Start the Rest Timer after set completion
                startRestTimer();

            } else {
                // If the set is unchecked, clear the recorded values and stop timer
                set.weight = '';
                set.reps = '';
                hideRestTimer(); 
            }
        }
    });


    // Initial render when the app loads (THE CRITICAL FIX for buttons)
    renderCurrentWorkout();
});
