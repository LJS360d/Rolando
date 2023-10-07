import axios from 'axios';

import { FileManager } from '../domain/FileManager';
import { USE_THRESHOLD } from '../../static/Static';
import { getRandom, getUrlExtension, toHieroglyphs, validateUrl } from '../../utils/Utils';

/**
 * `key`: Guild ID
 * `value`: MarkovChain
 */
export const chainsMap = new Map<string, MarkovChain>();

type MarkovState = Record<string, Record<string, number>>;
export type ChainAnalytics = {
	complexityScore: number;
	gifs: number;
	images: number;
	videos: number;
	replyRate: number;
	words: number;
};
export class MarkovChain {
	public state: MarkovState;
	public replyRate: number;
	gifs: Set<string>;
	images: Set<string>;
	videos: Set<string>;
	extensionMap: Map<string, Set<string>>;

	constructor() {
		this.state = {};
		this.replyRate = 10;
		this.gifs = new Set<string>();
		this.images = new Set<string>();
		this.videos = new Set<string>();
		this.extensionMap = new Map<string, Set<string>>([
			['.gif', this.gifs],
			['.png', this.images],
			['.webp', this.images],
			['.jpeg', this.images],
			['.jpg', this.images],
			['.mp4', this.videos],
			['.mov', this.videos],
		]);
	}

	provideData(messages: string[]): void {
		for (const message of messages) {
			this.updateState(message);
		}
	}

	updateState(message: string): void {
		if (message.startsWith('https:')) {
			if (validateUrl(message)) {
				const extension = getUrlExtension(message);
				if (extension && this.extensionMap.get(extension)) {
					this.extensionMap.get(extension).add(message);
				}
			} else return;
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
		let cumulativeWeight = 0;
		const cumulativeWeights = weights.map((weight) => (cumulativeWeight += weight));

		let start = 0;
		let end = cumulativeWeights.length - 1;

		while (end - start > 1) {
			const mid = Math.floor((start + end) / 2);
			if (cumulativeWeights[mid] > randomWeight) {
				end = mid;
			} else {
				start = mid;
			}
		}

		if (cumulativeWeights[start] > randomWeight) {
			return options[start];
		} else {
			return options[end];
		}
	}

	getWordsByValue(value: number): string[] {
		const valuedWords: string[] = [];
		const invertedIndex: Record<number, string[]> = {};

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
		const stateSize = Object.keys(this.state).length;
		let highValueWords = 0;

		for (const nextWords of Object.values(this.state)) {
			for (const wordValue of Object.values(nextWords)) {
				if (wordValue > USE_THRESHOLD) {
					highValueWords++;
				}
			}
		}

		// Calculate the complexity score based on state size and high-value words
		return 0.3 * (stateSize + highValueWords);
	}

	getAnalytics(): ChainAnalytics {
		return {
			complexityScore: this.getComplexity(),
			gifs: this.gifs.size,
			images: this.images.size,
			videos: this.videos.size,
			replyRate: this.replyRate,
			words: Object.keys(this.state).length,
		} as ChainAnalytics;
	}

	talk(length: number): string {
		const keys = Object.keys(this.state);
		const randomIndex = Math.floor(Math.random() * keys.length);
		const starterWord = keys[randomIndex];
		const sentence = this.filter(this.generateText(starterWord, length));
		return getRandom(1, 200) === 200 ? toHieroglyphs(sentence) : sentence;
	}

	async getGif(): Promise<string> {
		return this.getValidUrl(Array.from(this.gifs), 'gifs');
	}

	async getImage(): Promise<string> {
		return this.getValidUrl(Array.from(this.images), 'images');
	}

	async getVideo(): Promise<string> {
		return this.getValidUrl(Array.from(this.videos), 'videos');
	}

	delete(message: string, fileName: string): boolean {
		if (message.startsWith('https:')) {
				const extension = getUrlExtension(message);
				if (extension && this.extensionMap.get(extension)) {
					this.extensionMap.get(extension).delete(message);
				}
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

		// Also delete it from training data storage
		return FileManager.deleteOccurrences(message, fileName);
	}

	private filter(text: string): string {
		return text.replace(/\\n/g, '').trim();
	}

	private async getValidUrl(urls: string[], type?: string): Promise<string> {
		while (urls.length > 0) {
			const randomIndex = Math.floor(Math.random() * urls.length);
			const media = urls[randomIndex];

			if (await validateUrl(media)) {
				return media;
			} // Valid URL

			urls.splice(randomIndex, 1); // Remove invalid URL from array
		}

		return `I got no valid ${type ?? 'URLs'} in my brain`;
	}

}
