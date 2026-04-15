// Event listeners - enhanced with new features
document.addEventListener('DOMContentLoaded', function() {
    const searchInput = document.getElementById('searchInput');
    const searchButton = document.querySelector('.search-btn');
    const clearButton = document.querySelector('.clear-btn');
    const suggestions = document.getElementById('searchSuggestions');

    updateSuggestions(); // Initialize suggestions

    if (searchInput) {
        searchInput.addEventListener('focus', function() {
            if (this.value.trim() === '' && document.getElementById('results').innerHTML.trim() === '') {
                updateSuggestions();
                suggestions.style.display = 'block';
            }
        });

        searchInput.addEventListener('input', function() {
            const clearBtn = document.querySelector('.clear-btn');
            if (this.value.trim() !== '') {
                clearBtn.style.display = 'flex';
                suggestions.style.display = 'none';
            } else {
                clearBtn.style.display = 'none';
                if (document.getElementById('results').innerHTML.trim() === '') {
                    updateSuggestions();
                    suggestions.style.display = 'block';
                }
            }
        });

        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                performSearch();
            }
        });

        // Hide suggestions when clicking outside
        document.addEventListener('click', function(e) {
            if (!searchInput.contains(e.target) && !suggestions.contains(e.target)) {
                suggestions.style.display = 'none';
            }
        });
    }

    if (searchButton) {
        searchButton.addEventListener('click', function(e) {
            e.preventDefault();
            performSearch();
        });
    }

    if (clearButton) {
        clearButton.addEventListener('click', function(e) {
            e.preventDefault();
            clearSearch();
        });
    }
});

function getSearchHistory() {
    const history = JSON.parse(localStorage.getItem('searchHistory') || '[]');
    return history.slice(-3); // top 3 recent
}

function addToHistory(term) {
    let history = JSON.parse(localStorage.getItem('searchHistory') || '[]');
    history = history.filter(h => h !== term); // remove if exists
    history.push(term);
    localStorage.setItem('searchHistory', JSON.stringify(history.slice(-10))); // keep last 10
}

function updateSuggestions() {
    const suggestions = document.getElementById('searchSuggestions');
    const history = getSearchHistory();
    if (history.length === 0) {
        suggestions.innerHTML = '';
        return;
    }
    suggestions.innerHTML = history.map(term => `<div class="suggestion-item" onclick="setSearchTerm('${term.replace(/'/g, "\\'")}')">${term}</div>`).join('');
}

function setSearchTerm(term) {
    const searchInput = document.getElementById('searchInput');
    searchInput.value = term;
    document.getElementById('searchSuggestions').style.display = 'none';
    document.querySelector('.clear-btn').style.display = 'flex';
    performSearch();
}

function clearSearch() {
    const searchInput = document.getElementById('searchInput');
    searchInput.value = '';
    document.querySelector('.clear-btn').style.display = 'none';
    updateSuggestions();
    document.getElementById('searchSuggestions').style.display = 'block';
    document.getElementById('results').innerHTML = '';
    document.getElementById('stats').textContent = '';
    document.getElementById('noResults').style.display = 'none';
}

async function performSearch() {
    const query = document.getElementById('searchInput').value.trim();
    if (!query) return;

    const searchBtn = document.querySelector('.search-btn');
    const searchInput = document.getElementById('searchInput');
    searchBtn.disabled = true;
    searchInput.disabled = true;

    addToHistory(query);

    const searchLoading = document.getElementById('searchLoading');
    const results = document.getElementById('results');
    const noResults = document.getElementById('noResults');
    const stats = document.getElementById('stats');
    const suggestions = document.getElementById('searchSuggestions');

    // Hide suggestions and show loading
    suggestions.style.display = 'none';
    searchLoading.style.display = 'block';

    results.innerHTML = '';
    noResults.style.display = 'none';

    try {
        const params = new URLSearchParams({
            q: query,
            limit: 10
        });

        const response = await fetch(`/search?${params}`);
        const data = await response.json();

        searchLoading.style.display = 'none';
        stats.textContent = `${data.total} results (MongoDB: ${data.mongodb ? 'Connected' : 'Offline'})`;

        if (data.results.length === 0) {
            noResults.style.display = 'block';
            return;
        }

        data.results.forEach(result => {
            const div = document.createElement('div');
            div.className = 'result-item';
            div.innerHTML = `
                <div class="result-title">${result.title || result.docId}</div>
                <div class="result-content">${result.content ? result.content.substring(0, 200) + (result.content.length > 200 ? '...' : '') : ''}</div>
                <div class="result-score">Score: ${result.score}</div>
            `;
            results.appendChild(div);
        });

        searchBtn.disabled = false;
        searchInput.disabled = false;
    } catch (error) {
        console.error('Search error:', error);
        searchLoading.style.display = 'none';
        results.innerHTML = `<div style="color:red;">Error: ${error.message}</div>`;
        searchBtn.disabled = false;
        searchInput.disabled = false;
    }
}

async function showHealth() {
    const response = await fetch('/health');
    const data = await response.json();
    
    const panel = document.getElementById('healthPanel');
    panel.innerHTML = `
        <strong>✅ Engine Status</strong><br>
        MongoDB: ${data.mongodbConnected ? '🟢 Connected (' + data.mongodb.docs + ' docs)' : '🔴 Offline'}<br>
        Inverted Index: 🟢 ${data.invertedIndex.docs} docs, ${data.invertedIndex.terms} terms
    `;
}

window.addEventListener('DOMContentLoaded', () => {
    showHealth();
});

async function addDocument() {
    const title = document.getElementById('docTitle').value;
    const content = document.getElementById('docContent').value;
    
    if (!content.trim()) {
        alert('Enter some content!');
        return;
    }

    try {
        const response = await fetch('/index', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, content })
        });
        const data = await response.json();
        
        alert(`✅ Document added! ID: ${data.docId}`);
        document.getElementById('docTitle').value = '';
        document.getElementById('docContent').value = '';
        showHealth();
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

// Auto-search demo data - DISABLED to avoid interfering with user searches
// setTimeout(() => {
//     document.getElementById('searchInput').value = 'react';
//     performSearch();
// }, 1000);