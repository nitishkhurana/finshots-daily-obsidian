import FinshotsDailyPlugin, { FinshotsArticle, FINSHOTS_VIEW_TYPE } from 'main';
import { ItemView, WorkspaceLeaf, Notice, requestUrl } from 'obsidian';


export class FinshotsView extends ItemView {
    plugin: FinshotsDailyPlugin;
    private article: FinshotsArticle | null = null;
    private isLoading = false;

    constructor(leaf: WorkspaceLeaf, plugin: FinshotsDailyPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return FINSHOTS_VIEW_TYPE;
    }

    getDisplayText(): string {
        return "Finshots daily";
    }

    getIcon(): string {
        return "newspaper";
    }

    async onOpen() {
        await this.render();
        await this.loadArticle();
    }

    async onClose() {
    }

    private render() {
        const container = this.containerEl.children[1];
        container.empty();

        const headerEl = container.createEl("div", { cls: "finshots-header" });
        headerEl.createEl("h2", { text: "Finshots daily" });

        const refreshBtn = headerEl.createEl("button", {
            text: "Refresh",
            cls: "finshots-refresh-btn"
        });
        refreshBtn.addEventListener("click", () => void this.loadArticle());

        const contentEl = container.createEl("div", { cls: "finshots-content" });

        this.renderContent(contentEl);
    }

    private renderContent(contentEl: HTMLElement) {
        contentEl.empty();

        if (this.isLoading) {
            contentEl.createEl("div", {
                text: "Loading today's article...",
                cls: "finshots-loading"
            });
            return;
        }

        if (!this.article) {
            const errorEl = contentEl.createEl("div", { cls: "finshots-error" });
            errorEl.createEl("p", { text: "No article found for today." });
            errorEl.createEl("p", { text: "Click refresh to try again." });
            return;
        }

        // Article container
        const articleEl = contentEl.createEl("div", { cls: "finshots-article" });

        // Date
        articleEl.createEl("div", {
            text: this.article.date,
            cls: "finshots-date"
        });

        // Image
        if (this.article.imageUrl) {
            const imageEl = articleEl.createEl("img", {
                cls: "finshots-image"
            });
            imageEl.src = this.article.imageUrl;
            imageEl.alt = this.article.title;
        }

        // Title
        const titleEl = articleEl.createEl("h3", {
            text: this.article.title,
            cls: "finshots-title"
        });

        // Summary if available
        if (this.article.summary) {
            articleEl.createEl("p", {
                text: this.article.summary,
                cls: "finshots-summary"
            });
        }

        // Read more button
        const readMoreEl = articleEl.createEl("a", {
            text: "Read full article",
            cls: "finshots-read-more"
        });
        readMoreEl.href = this.article.articleUrl;
        readMoreEl.target = "_blank";
    }

    async loadArticle() {
        this.isLoading = true;
        const contentEl = this.containerEl.querySelector('.finshots-content') as HTMLElement;
        if (contentEl) {
            this.renderContent(contentEl);
        }

        try {
            this.article = await this.ParseAndGetArticle();
        } catch (error) {
            console.error('Failed to load Finshots article:', error);
            new Notice('Failed to load Finshots article');
            this.article = null;
        } finally {
            this.isLoading = false;
            if (contentEl) {
                this.renderContent(contentEl);
            }
        }
    }

    private async ParseAndGetArticle(): Promise<FinshotsArticle | null> {
        try {
            const proxyUrl = 'https://api.allorigins.win/get?url=';
            const targetUrl = encodeURIComponent('https://finshots.in/archive/');

            const response = await requestUrl({ url: proxyUrl + targetUrl, method: 'GET' });

            if (response.status < 200 || response.status >= 300) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            let data: { contents?: string };
            try {
                data = typeof response.json === 'object' ? response.json : JSON.parse(response.text);
            } catch (e) {
                throw new Error('Failed to parse proxy response');
            }

            // Check if we have the expected structure
            if (!data || !data.contents) {
                throw new Error('Invalid response structure from proxy');
            }

            const html = data.contents;

            // Parse HTML using DOMParser
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // Try multiple selectors to find articles
            const selectors = [
                '.post-feed article.post-card',
                'article.post-card',
                '.post-card',
                'article',
                '.post'
            ];

            let firstArticle = null;
            let usedSelector = '';

            for (const selector of selectors) {
                firstArticle = doc.querySelector(selector);
                if (firstArticle) {
                    usedSelector = selector;
                    break;
                }
            }

            if (!firstArticle) {
                const articleElements = doc.querySelectorAll('[class*="post"], [class*="article"], [class*="card"]');
                articleElements.forEach((el, index) => {
                });

                throw new Error('Could not find any article in the post feed');
            }

            const titleSelectors = [
                '.post-card-title',
                '.post-title',
                'h2',
                'h3',
                '[class*="title"]'
            ];

            let titleElement = null;
            let title = '';

            for (const selector of titleSelectors) {
                titleElement = firstArticle.querySelector(selector);
                if (titleElement) {
                    title = titleElement.textContent?.trim() || '';
                    if (title) {
                        break;
                    }
                }
            }

            if (!title) {
                title = 'Latest Finshots Article';
            }

            const imageSelectors = [
                '.post-card-image',
                'img',
                '[class*="image"]'
            ];

            let imageElement = null;
            let imageUrl = '';

            for (const selector of imageSelectors) {
                imageElement = firstArticle.querySelector(selector);
                if (imageElement) {
                    imageUrl = imageElement.getAttribute('src') || '';
                    if (!imageUrl) {
                        const srcset = imageElement.getAttribute('srcset');
                        if (srcset) {
                            const srcsetUrls = srcset.split(',');
                            const lastUrl = srcsetUrls[srcsetUrls.length - 1];
                            imageUrl = lastUrl.split(' ')[0].trim();
                        }
                    }
                    if (imageUrl) {
                        break;
                    }
                }
            }

            const linkSelectors = [
                '.post-card-content-link',
                'a[href*="/archive/"]',
                'a',
                '[href]'
            ];

            let linkElement = null;
            let articleUrl = '';

            for (const selector of linkSelectors) {
                linkElement = firstArticle.querySelector(selector);
                if (linkElement) {
                    articleUrl = linkElement.getAttribute('href') || '';
                    if (articleUrl && articleUrl !== '#') {
                        break;
                    }
                }
            }

            if (articleUrl && !articleUrl.startsWith('http')) {
                articleUrl = `https://finshots.in${articleUrl}`;
            }

            const dateSelectors = [
                '.post-card-meta-date',
                'time',
                '[datetime]',
                '[class*="date"]'
            ];

            let dateElement = null;
            let dateString = '';
            let formattedDate = new Date().toLocaleDateString();

            for (const selector of dateSelectors) {
                dateElement = firstArticle.querySelector(selector);
                if (dateElement) {
                    dateString = dateElement.getAttribute('datetime') || dateElement.textContent?.trim() || '';
                    if (dateString) {
                        break;
                    }
                }
            }

            if (dateString) {
                try {
                    const articleDate = new Date(dateString);
                    if (!isNaN(articleDate.getTime())) {
                        formattedDate = articleDate.toLocaleDateString();
                    }
                } catch (error) {
                    console.warn('Failed to parse date:', dateString);
                }
            }

            const excerptSelectors = [
                '.post-card-excerpt',
                '.excerpt',
                'p',
                '[class*="summary"]'
            ];

            let excerptElement = null;
            let summary = '';

            for (const selector of excerptSelectors) {
                excerptElement = firstArticle.querySelector(selector);
                if (excerptElement) {
                    summary = excerptElement.textContent?.trim() || '';
                    if (summary && summary.length > 20) { // Ensure it's not just a short text
                        break;
                    }
                }
            }

            const tagSelectors = [
                '.post-card-primary-tag',
                '.tag',
                '[class*="tag"]',
                '[class*="category"]'
            ];

            let tagElement = null;
            let category = '';

            for (const selector of tagSelectors) {
                tagElement = firstArticle.querySelector(selector);
                if (tagElement) {
                    category = tagElement.textContent?.trim() || '';
                    if (category) {
                        break;
                    }
                }
            }

            if (imageUrl && !imageUrl.startsWith('http')) {
                imageUrl = `https://finshots.in${imageUrl}`;
            }

            return {
                title,
                imageUrl,
                articleUrl,
                date: formattedDate,
                summary: summary ? `${category ? `[${category}] ` : ''}${summary}` : undefined
            };

        } catch (error) {
            return {
                title: 'Failed to fetch the latest article from Finshots Daily',
                imageUrl: '',
                articleUrl: 'https://finshots.in/',
                date: new Date().toLocaleDateString(),
                summary: 'Please check the Finshots website directly or try refreshing.'
            };
        }
    }
}
