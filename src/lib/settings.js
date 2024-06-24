const path          = require('node:path')

class Settings {
	#defaultSettings = {
		langCode : 'en-US',
	}

	#settings = {}

	constructor() {
		this.#settings = {
			...this.#defaultSettings,
			...this.loadFromDisk(),
		}
	}


	get all() {
		return this.#settings
	}

	get(key, defaultValue = null) {
		return this.#settings?.[key] ?? defaultValue
	}

	set(key, value) {
		this.#settings[key] = value
		this.saveToDisk()
	}

	loadFromDisk() {
		return {}
	}

	saveToDisk() {
		return
	}
}

class Translator {
	#appSet = null

	constructor(settings) {
		this.#appSet = settings
		this.loadFromDisk()
	}

	loadFromDisk() {
		return
	}

	eventString(_event, text) {
		if ( this.#appSet.get('langCode') === 'en-US' ) {
			return `~${text}~`
		}
		// check if key exists in new lang, return english otherwise
		return 'unimplemented'
	}
}

const settings = new Settings()
const translate = new Translator(settings)

const appState = {
	debug          : true,
	i18n           : translate,
	oscConnections : [],
	RENDER         : path.join(__dirname, '..', 'render'),
	settings       : settings,
	win            : null,
}

module.exports.appState = appState