let movies = [];
let waitlistQueue = [];
let debounceTimer;

const debounce = (func, delay) => {
    return function() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => func.apply(this, arguments), delay);
    }
}

const parseDateTime = dateTimeStr => {
    try {
        const [datePart, timePart] = dateTimeStr.split(', ');
        const [month, day] = datePart.split(' ');
        const [time, period, timezone] = timePart.trim().split(/\s+/);
        const [hours, minutes] = time.split(':');
        
        let hour = parseInt(hours);
        if (period === 'PM' && hour !== 12) hour += 12;
        else if (period === 'AM' && hour === 12) hour = 0;

        const date = new Date(`${month} ${day} ${new Date().getFullYear()} ${hour}:${minutes} ${timezone}`);
        return isNaN(date.getTime()) ? null : date;
    } catch (error) {
        console.error('Error parsing date:', error);
        return null;
    }
}

const formatDateTime = date => {
    if (!date || isNaN(date)) return 'Date not available';
    return date.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short'
    });
}

const highlightText = (text, query) => {
    if (!query) return text;
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(`(${escapedQuery})`, 'gi'), '<span class="highlight">$1</span>');
}

const displayResults = (results, query) => {
    const resultsDiv = document.getElementById('searchResults');
    resultsDiv.innerHTML = results.map(movie => 
        `<div class="result-item" onclick="showMovieDetails(${JSON.stringify(movie).replace(/"/g, '&quot;')})">
            ${highlightText(movie.title, query)}
        </div>`
    ).join('');
    resultsDiv.style.display = results.length ? 'block' : 'none';
}

const searchMovies = query => {
    if (query.length < 2) {
        document.getElementById('searchResults').style.display = 'none';
        return [];
    }
    const results = movies.filter(movie => 
        movie.title.toLowerCase().includes(query.toLowerCase())
    );
    displayResults(results, query);
    return results;
}

const showSearchResults = results => {
    document.getElementById('app').innerHTML = `
        <div>
            <a href="#" class="back-button" onclick="navigateBack(event)">← Back to Search</a>
            <div class="search-results">
                ${results.map(movie => `
                    <div class="movie-card" onclick="showMovieDetails(${JSON.stringify(movie).replace(/"/g, '&quot;')})">
                        <img src="${movie.posterImage || 'placeholder.jpg'}" alt="${movie.title}" loading="lazy">
                        <h3>${movie.title}</h3>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    updateWaitlistQueue();
}

const showMovieDetails = movie => {
    document.getElementById('app').innerHTML = `
        <div>
            <a href="#" class="back-button" onclick="navigateBack(event)">← Back to Search</a>
            <div class="movie-details">
                <h1>${movie.title}</h1>
                <img src="${movie.posterImage || 'placeholder.jpg'}" alt="${movie.title}" style="max-width: 300px;">
                <p>${movie.description || 'No description available.'}</p>
                <h2>Screenings</h2>
                <div id="screenings">
                    ${movie.screenings?.map((s, index) => `
                        <div class="screening" data-datetime="${s.datetime}">
                            <div>
                                <p>Date: ${formatDateTime(parseDateTime(s.datetime))}</p>
                                <p>Venue: ${s.venue}</p>
                                <p>City: ${s.city}</p>
                                <p>Type: ${s.type}</p>
                                ${s.hasOpenCaption ? '<p>Open Caption Available</p>' : ''}
                            </div>
                            <button 
                                class="waitlist-btn" 
                                onclick="toggleWaitlist(event, ${JSON.stringify(movie).replace(/"/g, '&quot;')}, ${index})"
                                data-status="${isInWaitlist(movie.title, s.datetime) ? 'remove' : 'add'}"
                            >
                                ${isInWaitlist(movie.title, s.datetime) ? '- Remove from my waitlist queue' : '+ Waitlist for me'}
                                <span class="info-icon">ⓘ<span class="tooltip">Wait4Me will waitlist for this movie as soon as the waitlist becomes available</span></span>
                            </button>
                        </div>
                    `).join('') || '<p>No screenings available.</p>'}
                </div>
            </div>
        </div>
    `;
    updateWaitlistQueue();
}

const isInWaitlist = (title, datetime) => 
    waitlistQueue.some(item => item.title === title && item.datetime === datetime);

const toggleWaitlist = (event, movie, screeningIndex) => {
    event.stopPropagation();
    const screening = movie.screenings[screeningIndex];
    const datetime = screening.datetime;
    
    if (isInWaitlist(movie.title, datetime)) {
        waitlistQueue = waitlistQueue.filter(item => 
            !(item.title === movie.title && item.datetime === datetime)
        );
    } else {
        waitlistQueue.push({
            title: movie.title,
            datetime,
            type: screening.type,
            venue: screening.venue,
            city: screening.city,
            hasOpenCaption: screening.hasOpenCaption
        });
        waitlistQueue.sort((a, b) => parseDateTime(a.datetime) - parseDateTime(b.datetime));
    }
    
    saveQueueToCookie();
    updateWaitlistQueue();
    
    const btn = event.target.closest('.waitlist-btn');
    const isRemove = isInWaitlist(movie.title, datetime);
    btn.dataset.status = isRemove ? 'remove' : 'add';
    btn.innerHTML = `
        ${isRemove ? '- Remove from my waitlist queue' : '+ Waitlist for me'}
        <span class="info-icon">ⓘ<span class="tooltip">Wait4Me will waitlist for this movie as soon as the waitlist becomes available</span></span>
    `;
}

const updateWaitlistQueue = () => {
    const queueDiv = document.getElementById('waitlistQueue');
    const queueItems = document.getElementById('queueItems');
    
    if (!queueDiv || !queueItems) return;
    
    if (waitlistQueue.length === 0) {
        queueDiv.style.display = 'none';
        return;
    }
    
    queueDiv.style.display = 'block';
    queueItems.innerHTML = waitlistQueue.map(item => {
        const movie = movies.find(m => m.title === item.title);
        return `
            <div class="queue-item">
                <div style="display: flex; gap: 10px; align-items: start;">
                    <img src="${movie?.posterImage || 'placeholder.jpg'}" alt="${item.title}" style="width: 50px; height: 70px; object-fit: cover; border-radius: 4px;">
                    <div>
                        <strong style="cursor: pointer;" onclick="showMovieDetails(${JSON.stringify(movie).replace(/"/g, '&quot;')})">
                            ${item.title}
                        </strong>
                        <p>Date: ${formatDateTime(parseDateTime(item.datetime))}</p>
                        <p>Venue: ${item.venue}</p>
                        <p>City: ${item.city}</p>
                        <p>Type: ${item.type}</p>
                        ${item.hasOpenCaption ? '<p>Open Caption Available</p>' : ''}
                    </div>
                </div>
                <button class="waitlist-btn" data-status="remove" onclick="removeFromQueue('${item.title}', '${item.datetime}')">
                    - Remove
                </button>
            </div>
        `;
    }).join('');
}

const removeFromQueue = (title, datetime) => {
    waitlistQueue = waitlistQueue.filter(item => 
        !(item.title === title && item.datetime === datetime)
    );
    updateWaitlistQueue();
    saveQueueToCookie();
    
    document.querySelectorAll('.screening').forEach(div => {
        if (div.dataset.datetime === datetime) {
            const btn = div.querySelector('.waitlist-btn');
            if (btn) {
                btn.dataset.status = 'add';
                btn.innerHTML = `
                    + Waitlist for me
                    <span class="info-icon">ⓘ<span class="tooltip">Wait4Me will waitlist for this movie as soon as the waitlist becomes available</span></span>
                `;
            }
        }
    });
}

const navigateBack = event => {
    event.preventDefault();
    document.getElementById('app').innerHTML = `
        <div class="search-container">
            <h2>What films would you like to waitlist?</h2>
            <form id="searchForm" onsubmit="handleSearchSubmit(event)">
                <div style="display: flex; gap: 10px; width: 80%; margin: 0 auto;">
                    <input type="text" id="searchInput" placeholder="Search for movies...">
                    <button type="submit" class="search-button">Search</button>
                </div>
            </form>
            <div id="searchResults"></div>
            <div id="loadingMessage" style="display: none;">Loading movies...</div>
            <div id="errorMessage"></div>
        </div>
        <div id="waitlistQueue" class="waitlist-queue" style="display: none;">
            <h2>Waitlist Queue</h2>
            <div id="queueItems"></div>
        </div>
    `;
    setupEventListeners();
    updateWaitlistQueue();
}

const handleSearchSubmit = event => {
    event.preventDefault();
    const query = document.getElementById('searchInput').value.trim();
    if (query.length >= 2) {
        showSearchResults(searchMovies(query));
    }
}

const setupEventListeners = () => {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', 
            debounce(e => searchMovies(e.target.value.trim()), 300)
        );
    }

    document.addEventListener('click', (e) => {
        const searchResults = document.getElementById('searchResults');
        if (searchResults && !e.target.closest('.search-container')) {
            searchResults.style.display = 'none';
        }
    });
}

const saveQueueToCookie = () => {
    document.cookie = `waitlistQueue=${encodeURIComponent(JSON.stringify(waitlistQueue))}; path=/; max-age=31536000; SameSite=Strict`;
}

const loadQueueFromCookie = () => {
    const queueCookie = document.cookie.split(';').find(c => c.trim().startsWith('waitlistQueue='));
    if (queueCookie) {
        try {
            waitlistQueue = JSON.parse(decodeURIComponent(queueCookie.split('=')[1]));
            updateWaitlistQueue();
        } catch (error) {
            console.error('Error loading queue from cookie:', error);
        }
    }
}

const init = async () => {
    const loadingMsg = document.getElementById('loadingMessage');
    const errorMsg = document.getElementById('errorMessage');
    const searchInput = document.getElementById('searchInput');
    
    try {
        loadingMsg.style.display = 'block';
        searchInput.disabled = true;
        
        const response = await fetch('./movies.json');
        if (!response.ok) {
            console.error('HTTP error:', response.status);
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Loaded movies:', data.length);
        movies = data;
        
        loadingMsg.style.display = 'none';
        searchInput.disabled = false;
        
        setupEventListeners();
        loadQueueFromCookie();
    } catch (error) {
        console.error('Error loading movies:', error);
        if (errorMsg) {
            errorMsg.textContent = 'Error loading movies. Please try refreshing the page.';
            errorMsg.style.display = 'block';
        }
        if (loadingMsg) {
            loadingMsg.style.display = 'none';
        }
    }
}

window.onload = init;
