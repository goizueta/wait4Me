import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function handlePrivacyPopup(page) {
    try {
        // Wait for privacy popup and click the "Do Not Sell" button
        await page.waitForSelector('button:has-text("Do Not Sell")', { timeout: 25000 });
        await page.click('button:has-text("Do Not Sell")');
        console.log('Handled privacy popup');
    } catch (error) {
        console.log('No privacy popup found or already handled');
    }
}

async function waitForSelector(page, selector, timeout = 25000) {
    try {
        await page.waitForSelector(selector, { timeout });
        return true;
    } catch (error) {
        return false;
    }
}

async function scrapeMoviesFromPage(page, isFirstPage = true) {
    try {
        if (isFirstPage) {
            console.log('Navigating to films page...');
            await page.setDefaultNavigationTimeout(25000);
            await page.setDefaultTimeout(25000);
            
            // Try to load the page with retries
            let retries = 3;
            while (retries > 0) {
                try {
                    await page.goto('https://festival.sundance.org/program/films', {
                        waitUntil: 'domcontentloaded'
                    });
                    break;
                } catch (error) {
                    retries--;
                    if (retries === 0) throw error;
                    console.log('Retrying page load...');
                    await page.waitForTimeout(1000);
                }
            }
            
            // Handle privacy popup if it appears
            await handlePrivacyPopup(page);
        }
        
        // Wait for the films section to load
        console.log('Waiting for films section...');
        const filmsLoaded = await waitForSelector(page, '.sd_film_list_wpr');
        if (!filmsLoaded) {
            console.log('Films section not found, taking screenshot...');
            await page.screenshot({ path: 'page-state.png', fullPage: true });
            throw new Error('Films section not found');
        }

        // Extract movie data with more detailed logging
        console.log('Extracting movie data...');
        const movies = await page.evaluate(() => {
            console.log('Inside evaluate function');
            const movieElements = document.querySelectorAll('.sd_event_card');
            console.log('Found elements:', movieElements.length);
            
            return Array.from(movieElements).map(movie => {
                const titleEl = movie.querySelector('.sd_event_title h2');
                const descEl = movie.querySelector('.sd_event_card_desc_content p');
                const imgEl = movie.querySelector('.sd_event_card_img img');
                const linkEl = movie;
                const categoryEl = movie.querySelector('.sd_film_category');
                const screeningEls = movie.querySelectorAll('.sd_event_card_time .sd_flex');
                
                const screenings = Array.from(screeningEls).map(screening => {
                    const text = screening.querySelector('span').textContent.trim();
                    const isInPerson = screening.querySelector('img[alt="online"][src*="in_person"]') !== null;
                    const isOnline = screening.querySelector('img[alt="online"][src*="online"]') !== null;
                    const isSoldOut = text.includes('SOLD OUT');
                    
                    return {
                        datetime: text.replace('SOLD OUT', '').trim(),
                        type: isInPerson ? 'In Person' : isOnline ? 'Online' : 'Unknown',
                        status: isSoldOut ? 'Sold Out' : 'Available'
                    };
                });
                
                const data = {
                    title: titleEl ? titleEl.textContent.trim() : '',
                    description: descEl ? descEl.textContent.trim() : '',
                    posterImage: imgEl ? imgEl.src : '',
                    url: linkEl ? linkEl.href : '',
                    category: categoryEl ? categoryEl.textContent.trim() : '',
                    screenings
                };
                
                // Store the URL for later fetching screenings
                if (data.url) {
                    console.log('Processed movie:', data.title);
                }
                return data;
            });
        });

        console.log(`Found ${movies.length} movies on page`);
        if (movies.length === 0) {
            throw new Error('No movies found on page');
        }
        return movies;
    } catch (error) {
        console.error('Error in scrapeMoviesFromPage:', error);
        // Take a screenshot on error for debugging
        await page.screenshot({ path: 'error-screenshot.png' });
        throw error;
    }
}

async function clickNextPage(page) {
    try {
        console.log('Attempting to navigate to next page...');
        
        // Scroll to bottom and wait for any dynamic content to load
        await page.evaluate(() => {
            return new Promise((resolve) => {
                window.scrollTo(0, document.body.scrollHeight);
                setTimeout(resolve, 2000);
            });
        });

        // Wait for the next button to be present
        const nextButtonSelector = 'li.next a[tabindex="0"][role="button"][aria-disabled="false"][aria-label="Next page"]';
        console.log(`Waiting for next button with selector: ${nextButtonSelector}`);
        
        await page.waitForSelector(nextButtonSelector, { timeout: 5000 });
        const nextButton = await page.$(nextButtonSelector);
        
        if (!nextButton) {
            console.log('Next button not found');
            return false;
        }

        // Click the next button and wait for content to update
        console.log('Clicking next button...');
        await nextButton.click();
        
        // Wait for content to update using a combination of methods
        await Promise.all([
            // Wait for any network requests to finish
            page.waitForNetworkIdle({ timeout: 25000 }),
            // Wait for the film list to be visible
            page.waitForSelector('.sd_film_list_wpr', { visible: true, timeout: 25000 }),
            // Wait for any loading indicators to finish
            page.evaluate(() => {
                return new Promise((resolve) => {
                    const checkLoading = () => {
                        const loadingEl = document.querySelector('.loading-indicator');
                        if (!loadingEl || loadingEl.style.display === 'none') {
                            resolve();
                        } else {
                            setTimeout(checkLoading, 100);
                        }
                    };
                    checkLoading();
                });
            })
        ]);

        // Verify we actually moved to the next page by checking the active page number
        const newPageNumber = await page.evaluate(() => {
            const activePageEl = document.querySelector('li.active a[aria-current="page"]');
            return activePageEl ? parseInt(activePageEl.textContent) : null;
        });
        
        console.log(`Navigated to page ${newPageNumber}`);
        return true;
    } catch (error) {
        console.error('Error clicking next page:', error);
        return false;
    }
}

async function scrapeAllMovies() {
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: { width: 1920, height: 1080 },
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080'],
        timeout: 25000
    });
    
    const page = await browser.newPage();
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    try {
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        console.log('Starting movie scraping...');
        let allMovies = [];
        let currentPage = 1;
        let hasNextPage = true;
        
        while (hasNextPage && currentPage <= 8) {
            console.log(`Scraping page ${currentPage} of 8...`);
            const movies = await scrapeMoviesFromPage(page, currentPage === 1);
            allMovies = allMovies.concat(movies);
            
            // Navigate to next page if available
            if (currentPage < 8) {
                hasNextPage = await clickNextPage(page);
                if (hasNextPage) {
                    currentPage++;
                }
            } else {
                hasNextPage = false;
            }
        }
        
        console.log(`Successfully scraped ${allMovies.length} movies total`);
        await browser.close();
        return allMovies;
    } catch (error) {
        console.error('Error during scraping:', error);
        await browser.close();
        throw error;
    }
}

// Check if movies.json exists and is not older than 24 hours
async function shouldScrapeMovies() {
    try {
        const stats = await fs.stat('movies.json');
        const now = new Date();
        const fileAge = now - stats.mtime;
        // Return true if file is older than 10 days
        return fileAge > 10 * 24 * 60 * 60 * 1000;
    } catch (error) {
        // File doesn't exist
        return true;
    }
}

async function main() {
    try {
        if (await shouldScrapeMovies()) {
            console.log('Starting fresh scrape...');
            const movies = await scrapeAllMovies();
            await fs.writeFile('movies.json', JSON.stringify(movies, null, 2));
            console.log('Movies saved to movies.json');
        } else {
            console.log('Using cached movies.json (less than 24 hours old)');
        }
    } catch (error) {
        console.error('Failed to save movies:', error);
        process.exit(1);
    }
}

// Only run scraping if this file is being run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main();
}

// Export for use in other files
export async function getMovies() {
    try {
        const data = await fs.readFile('movies.json', 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading movies.json:', error);
        return [];
    }
}
