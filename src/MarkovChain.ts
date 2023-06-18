import axios from 'axios';

import { FileManager } from './FileManager';

/**
 * `key`: Guild ID 
 * `value`: new MarkovChain
 */
export const chainsMap = new Map<string, MarkovChain>();

interface MarkovState {
    [key: string]: {
        [key: string]: number;
    };
}

export class MarkovChain {
    public state: MarkovState;
    public replyRate: number;
    gifs: Set<string>;
    images: Set<string>;
    videos: Set<string>;

    constructor() {
        this.state = {};
        this.replyRate = 10
        this.gifs = new Set<string>();
        this.images = new Set<string>();
        this.videos = new Set<string>();
    }

    provideData(messages: string[]): void {
        for (const message of messages) {
            this.updateState(message);
        }
    }

    updateState(message: string): void {
        if (message.startsWith('https:')) {
            if (message.endsWith('.gif'))
                this.gifs.add(message);
            if (message.endsWith('.png') || message.endsWith('.jpeg') || message.endsWith('.jpg'))
                this.images.add(message);
            if (message.endsWith('.mp4') || message.endsWith('.mov'))
                this.videos.add(message);

        }
        const words = message.split(' ');

        for (let i = 0; i < words.length - 1; i++) {
            const currentWord = words[i];
            const nextWord = words[i + 1];

            if (!this.state[currentWord]) {
                this.state[currentWord] = {};
            }

            if (!this.state[currentWord][nextWord]) {
                this.state[currentWord][nextWord] = 1;
            } else {
                this.state[currentWord][nextWord]++;
            }
        }
    }

    generateText(startWord: string, length: number): string {
        let currentWord = startWord;
        let generatedText = currentWord;

        for (let i = 0; i < length; i++) {
            const nextWords = this.state[currentWord];
            if (!nextWords) {
                break;
            }

            const nextWordArray = Object.keys(nextWords);
            const nextWordWeights = Object.values(nextWords);

            currentWord = this.weightedRandomChoice(nextWordArray, nextWordWeights);
            generatedText += ' ' + currentWord;
        }

        return generatedText;
    }

    private weightedRandomChoice(options: string[], weights: number[]): string {
        const totalWeight = weights.reduce((a, b) => a + b, 0);
        const randomWeight = Math.random() * totalWeight;
        let weightSum = 0;

        for (let i = 0; i < options.length; i++) {
            weightSum += weights[i];
            if (randomWeight <= weightSum) {
                return options[i];
            }
        }

        return options[options.length - 1];
    }

    getWordsByValue(value: number): string[] {
        const valuedWords: string[] = [];
        const invertedIndex: { [value: number]: string[] } = {};

        // Build the inverted index
        for (const currentWord in this.state) {
            const nextWords = this.state[currentWord];
            for (const nextWord in nextWords) {
                const wordValue = nextWords[nextWord];
                if (!invertedIndex[wordValue]) {
                    invertedIndex[wordValue] = [];
                }
                invertedIndex[wordValue].push(nextWord);
            }
        }

        // Retrieve words with the specified value from the inverted index
        if (invertedIndex[value]) {
            valuedWords.push(...invertedIndex[value]);
        }

        return valuedWords;
    }

    getWordsHigherThanValue(value: number): string[] {
        const valuedWords: string[] = [];

        for (const currentWord in this.state) {
            const nextWords = this.state[currentWord];
            for (const nextWord in nextWords) {
                const wordValue = nextWords[nextWord];
                if (wordValue > value) {
                    valuedWords.push(nextWord);
                }
            }
        }
        return valuedWords;
    }

    getComplexity(): number {
        const USE_THRESHOLD = 15
        const stateSize = Object.keys(this.state).length;
        let highValueWords = 0;

        for (const currentWord in this.state) {
            const nextWords = this.state[currentWord];
            for (const nextWord in nextWords) {
                const wordValue = nextWords[nextWord];
                if (wordValue > USE_THRESHOLD) { // Adjust the threshold for what is considered a "high-value" word
                    highValueWords++;
                }
            }
        }
        // Calculate the complexity score based on state size and high-value words
        const complexityScore = stateSize + highValueWords;

        return complexityScore;

    }

    async getGif(): Promise<string> {
        const gifsArray = Array.from(this.gifs)
        while (gifsArray.length > 0) {
            const randomIndex = Math.floor(Math.random() * gifsArray.length);
            const gifURL = gifsArray[randomIndex];

            if (await validateURL(gifURL)) {
                return gifURL; // Valid URL
            } else {
                gifsArray.splice(randomIndex, 1); // Remove invalid URL from array
            }
        }

        return "I got no gifs in my brain"; // No valid URLs found
    }

    async getImage(): Promise<string> {
        const imagesArray = Array.from(this.images)
        while (imagesArray.length > 0) {
            const randomIndex = Math.floor(Math.random() * imagesArray.length);
            const imageURL = imagesArray[randomIndex];

            if (await validateURL(imageURL)) {
                return imageURL; // Valid URL
            } else {
                imagesArray.splice(randomIndex, 1); // Remove invalid URL from array
            }
        }

        return "I got no images in my brain"; // No valid URLs found
    }


    async getVideo(): Promise<string> {
        const videosArray = Array.from(this.videos)
        while (videosArray.length > 0) {
            const randomIndex = Math.floor(Math.random() * videosArray.length);
            const videoURL = videosArray[randomIndex];

            if (await validateURL(videoURL)) {
                return videoURL; // Valid URL
            } else {
                videosArray.splice(randomIndex, 1); // Remove invalid URL from array
            }
        }

        return "I got no videos in my brain"; // No valid URLs found
    }

    talk(length: number): string {
        const keys = Object.keys(this.state);
        const randomIndex = Math.floor(Math.random() * keys.length);
        const starterWord = keys[randomIndex];
        return this.filter(this.generateText(starterWord, length));
    }

    private filter(text: string): string {
        return text.replace(/\\n/g, '').trim();
    }

    delete(message: string, fileName: string): boolean {
        //given a message delete it from the markov chain
        if (message.startsWith('https:')) {
            if (message.endsWith('.gif'))
                this.gifs.delete(message)
            if (message.endsWith('.png') || message.endsWith('.jpeg') || message.endsWith('.jpg'))
                this.images.delete(message);
            if (message.endsWith('.mp4') || message.endsWith('.mov'))
                this.videos.delete(message);
        }
        const words = message.split(' ');
        for (let i = 0; i < words.length - 1; i++) {
            const currentWord = words[i];
            const nextWord = words[i + 1];
            if (this.state[currentWord]) {
                if (this.state[currentWord][nextWord]) {
                    this.state[currentWord][nextWord]--;
                }
            }
        }
        //also delete it from training data storage
        return FileManager.deleteOccurrences(message, fileName);
    }

}


async function validateURL(url: string): Promise<boolean> {
    try {
        const response = await axios.get(url);
        return response.status === 200; 
    } catch (error) {
        return false; // Invalid URL or request error
    }
}
