import fs from 'fs';
import path from 'path';

// Mock fetch function
global.fetch = jest.fn();

// Load and execute the HTML file content
const htmlContent = fs.readFileSync(path.resolve(__dirname, './index.html'), 'utf8');
document.documentElement.innerHTML = htmlContent;

// Execute the script content to set up the global functions
const scriptContent = htmlContent.match(/<script>([\s\S]*)<\/script>/)[1];
eval(scriptContent);

describe('Sundance Movie Search', () => {
    let originalFetch;
    
    beforeEach(() => {
        // Clear all mocks before each test
        jest.clearAllMocks();
        // Reset the DOM
        document.body.innerHTML = document.documentElement.innerHTML;
        // Setup event listeners
        window.setupEventListeners();
    });

    test('fetchAllMovies should fetch from all 8 pages', async () => {
        // Mock the fetch responses
        const mockMovies = [
            { title: 'Movie 1', id: '1' },
            { title: 'Movie 2', id: '2' }
        ];

        global.fetch.mockImplementation((url) => {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({
                    data: {
                        films: {
                            items: mockMovies
                        }
                    }
                })
            });
        });

        // Get the movies
        const movies = await window.fetchAllMovies();

        // Should have called fetch 8 times (once for each page)
        expect(fetch).toHaveBeenCalledTimes(8);
        
        // Verify the URLs called
        for (let i = 1; i <= 8; i++) {
            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining(`page=${i}`),
                expect.any(Object)
            );
        }
    });

    test('search should filter movies correctly', async () => {
        // Mock movies data
        window.movies = [
            { title: 'Test Movie', id: '1' },
            { title: 'Another Movie', id: '2' },
            { title: 'Something Else', id: '3' }
        ];

        const searchInput = document.getElementById('searchInput');
        
        // Test search
        searchInput.value = 'Test';
        searchInput.dispatchEvent(new Event('input'));

        // Wait for debounce
        await new Promise(resolve => setTimeout(resolve, 350));

        const searchResults = document.getElementById('searchResults');
        expect(searchResults.textContent).toContain('Test Movie');
        expect(searchResults.textContent).not.toContain('Another Movie');
    });

    test('should handle API errors gracefully', async () => {
        // Mock fetch to simulate an error
        global.fetch.mockImplementation(() => 
            Promise.reject(new Error('API Error'))
        );

        // Try to fetch movies
        await window.fetchMovies();

        // Check if error message is displayed
        const errorMsg = document.getElementById('errorMessage');
        expect(errorMsg.style.display).toBe('block');
        expect(errorMsg.textContent).toContain('Error loading movies');
    });
});
