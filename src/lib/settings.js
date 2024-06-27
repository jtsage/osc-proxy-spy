/*                   ____                      ____              
 *     ___  ___  ___|  _ \ _ __ _____  ___   _/ ___| _ __  _   _ 
 *    / _ \/ __|/ __| |_) | '__/ _ \ \/ / | | \___ \| '_ \| | | |
 *   | (_) \__ \ (__|  __/| | | (_) >  <| |_| |___) | |_) | |_| |
 *    \___/|___/\___|_|   |_|  \___/_/\_\\__, |____/| .__/ \__, |
 *                                       |___/      |_|    |___/ 
 * (c) 2024 JTSage <https://github.com/jtsage/osc-proxy-spy> */

const path  = require('node:path')
const fs    = require('node:fs')
const {app} = require('electron')

class Settings {
	#defaultSettings = {
		langCode : 'en-US',
		connections : [null, {}, {}, {}, {}, {}, {}, {}, {}],
	}

	#settings = {}

	constructor() {
		const settingsOnDisk = this.loadFromDisk()

		if ( settingsOnDisk === null ) {
			this.#settings = { ...this.#defaultSettings }

			for ( let i = 1; i <= 8; i++ ) {
				this.saveConnection({number : i, data : {}})
			}
		} else {
			this.#settings = {
				...this.#defaultSettings,
				...settingsOnDisk,
			}
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
		if ( ! fs.existsSync(this.#path) ) { return null }
		return JSON.parse(fs.readFileSync(this.#path))
	}

	saveToDisk() {
		fs.writeFileSync(this.#path, JSON.stringify(this.#settings, null, 4))
	}

	get #path() {
		return path.join(app.getPath('userData'), 'config.json')
	}

	#isDefined(value)   { return typeof value !== 'undefined' && value !== '' }
	#nullishText(value) { return this.#isDefined(value) ? value : null }
	#nullishInt(value)  { return this.#isDefined(value) ? parseInt(value) : null }

	getConnection(number) {
		return this.#settings.connections[number]
	}

	saveConnection(details) {
		try {
			const thisConnection = {
				isActive   : details.data.active ?? false,
				name       : this.#nullishText(details.data.name),

				addressIn    : this.#nullishText(details.data['in-address']),
				addressOut   : this.#nullishText(details.data['out-address']),
				portIn       : this.#nullishInt(details.data['in-port']),
				portOut      : this.#nullishInt(details.data['out-port']),
				sharedSocket : details.data['shared-socket'] ?? false,

				proxyPairs : [],

				proxyInAddress  : this.#nullishText(details.data['proxy-in-address']),
				proxyInPort     : this.#nullishInt(details.data['proxy-in-port']),

				heartbeatTime   : this.#nullishInt(details.data['heartbeat-time']),
			}

			for ( let i = 1; i <= 3; i++ ) {
				if ( this.#isDefined(details.data[`proxy-00${i}-port`]) && this.#isDefined(details.data[`proxy-00${i}-address`]) ) {
					thisConnection.proxyPairs.push({
						address : this.#nullishText(details.data[`proxy-00${i}-address`]),
						port    : this.#nullishInt(details.data[`proxy-00${i}-port`]),
					})
				}
			}

			this.#settings.connections[details.number] = thisConnection
			this.saveToDisk()
		} catch {
			return false
		}
		return true
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
	oscConnections : [null, null, null, null, null, null, null, null, null],
	RENDER         : path.join(__dirname, '..', 'render'),
	settings       : settings,
	win            : null,
}

module.exports.appState = appState