// Global State Object for the current workout session
let currentWorkout = {
    date: new Date().toISOString().slice(0, 10), // YYYY-MM-DD
    exercises: []
};

// Element references
const exerciseListEl = document.getElementById('exercise-list');
const addExerciseBtn = document.getElementById('add-exercise-btn');
const finishWorkoutBtn = document.getElementById('finish-workout-btn');
const historyContainerEl = document.getElementById('workout-history-container');


// --- 1. CORE FUNCTION: Adds a New Exercise to the Current Session ---
function addExercise() {
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


// --- 2. CORE FUNCTION: Generates the HTML for the Current Session ---
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
            
            // Set Number
            setRow.innerHTML += `<span class="set-number">${set.setNumber}</span>`;
            
            // Weight Input
            setRow.innerHTML += `
                <input type="number" data-set-id="${set.setNumber}" data-field="weight" 
                       value="${set.weight}" placeholder="Weight" inputmode="decimal">
                <span class="input-label">kg</span>`;
            
            // Reps Input
            setRow.innerHTML += `
                <input type="number" data-set-id="${set.setNumber}" data-field="reps" 
                       value="${set.reps}" placeholder="Reps" inputmode="numeric">
                <span class="input-label">reps</span>`;

            // Completion Circle
            const statusEl = document.createElement('div');
            statusEl.className = set.completed ? 'set-status completed' : 'set-status';
            statusEl.dataset.exerciseId = exercise.id;
            statusEl.dataset.setNumber = set.setNumber;
            
            setRow.appendChild(statusEl);
            card.appendChild(setRow);
        });

        // Add New Set Button
        const addSetBtn = document.createElement('button');
        addSetBtn.className = 'primary-btn';
        addSetBtn.style.marginTop = '10px';
        addSetBtn.style.padding = '10px';
        addSetBtn.textContent = '+ Add Set';
        addSetBtn.onclick = () => addSetToExercise(exercise.id);
        
        card.appendChild(addSetBtn);
        exerciseListEl.appendChild(card);
    });
}


// --- 3. HELPER FUNCTION: Adds a new set to an existing exercise ---
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

// --- 4. DATA SAVING: Handles saving workout data to LocalStorage ---
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


// --- 5. HISTORY RENDERING: Loads and displays saved workouts ---
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
        historyCard.className = 'exercise-card'; // Reuse the card style
        
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


// --- EVENT LISTENERS AND INITIALIZATION ---

document.addEventListener('DOMContentLoaded', () => {
    
    // PWA Service Worker Registration
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('service-worker.js')
                .then(registration => console.log('SW registered: ', registration.scope))
                .catch(err => console.log('SW registration failed: ', err));
        });
    }

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
    
    // 4. Delegated Event Listener for Dynamic Elements (Inputs and Status Circles)
    exerciseListEl.addEventListener('change', (e) => {
        // Handle input changes (Weight/Reps)
        if (e.target.tagName === 'INPUT' && e.target.type === 'number') {
            const input = e.target;
            const cardEl = input.closest('.exercise-card');
            // Find exercise name from the card header
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

            // Find the exercise and update the completion status
            const exercise = currentWorkout.exercises.find(e => e.id === exerciseId);
            if (exercise) {
                const set = exercise.sets.find(s => s.setNumber === setNumber);
                if (set) {
                    set.completed = !set.completed;
                    statusEl.classList.toggle('completed', set.completed);
                }
            }
        }
    });


    // Initial render when the app loads (THIS IS THE FIX)
    renderCurrentWorkout();
});
