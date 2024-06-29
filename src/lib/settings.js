/*                   ____                      ____              
 *     ___  ___  ___|  _ \ _ __ _____  ___   _/ ___| _ __  _   _ 
 *    / _ \/ __|/ __| |_) | '__/ _ \ \/ / | | \___ \| '_ \| | | |
 *   | (_) \__ \ (__|  __/| | | (_) >  <| |_| |___) | |_) | |_| |
 *    \___/|___/\___|_|   |_|  \___/_/\_\\__, |____/| .__/ \__, |
 *                                       |___/      |_|    |___/ 
 * (c) 2024 JTSage <https://github.com/jtsage/osc-proxy-spy> */

const path          = require('node:path')
const fs            = require('node:fs')
const {app, shell } = require('electron')
const EventEmitter  = require('node:events')

class Settings {
	#defaultSettings = {
		connections     : [null, {}, {}, {}, {}, {}, {}, {}, {}],
		langCode        : 'en-US',
		showDateInfo    : true,
		showEachMessage : true,
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

		this.saveToDisk()
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
		return this.#settings[key]
	}

	toggle(key, forceValue = null) {
		this.#settings[key] = forceValue !== null ? forceValue : !this.#settings[key]
		this.saveToDisk()
		return this.#settings[key]
	}

	loadFromDisk() {
		if ( ! fs.existsSync(this.#path) ) { return null }
		return JSON.parse(fs.readFileSync(this.#path))
	}

	saveToDisk() {
		try {
			fs.writeFileSync(this.#path, JSON.stringify(this.#settings, null, 4))
			appState.log.addGood('Saved Settings.')
		} catch (err) {
			appState.log.addError(`Saved Settings Failed :: ${err}`)
		}
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

	inactivateConnection(number) {
		this.#settings.connections[number].isActive = false
		this.saveToDisk()
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

				heartbeatAddress : this.#nullishText(details.data['heartbeat-address']),
				heartbeatArgs    : details.data?.['heartbeat-args'] ?? [],
				heartbeatTime    : this.#nullishInt(details.data['heartbeat-time']),
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
		} catch (err) {
			appState.log.addError(`Connection #${details.number} :: Save Failed : ${err.message}`)
			return false
		}
		appState.log.addGood(`Connection #${details.number} :: SAVED`)
		return true
	}
}

class Logger extends EventEmitter {
	#logItems = []

	constructor() {
		super()
		this.#clear()
	}

	add(thisStatus, text, date = null) {
		const thisDate = (date === null ? new Date() : date).toISOString()
		
		this.#logItems.push([
			thisStatus,
			thisDate,
			text
		])
		this.#write(thisStatus, thisDate, text)
		this.emit('new', thisStatus, thisDate, text)
	}
	addGood(text, date = null) { this.add(true, text, date) }
	addError(text, date = null) { this.add(false, text, date) }

	getAll() {
		return this.#logItems
	}

	#clear() {
		fs.writeFileSync(this.#path, '')
	}
	
	#write(thisStatus, thisDate, text) {
		try {
			const logLine = `${thisDate} | ${thisStatus ? 'OK    :: ' : 'ERROR :: '}${text}\n`
			fs.appendFileSync(this.#path, logLine)
		} catch (err) {
			this.emit('new', false, thisDate, `LOG FILE ERROR :: ${err.message}`)
		}
	}

	get #path() {
		return path.join(app.getPath('userData'), 'log.txt')
	}
}

class Translator {
	#langSets          = {}
	#translationMemory = new Set()

	constructor() {
		this.loadFromDisk()
	}

	get langKeyList() {
		const returnObject = [
			['en-US', 'English (US)'],
		]
		for ( const langCode of Object.keys(this.#langSets) ) {
			returnObject.push([
				langCode,
				this.#langSets[langCode].languageName
			])
		}
		return returnObject
	}

	get #getPath() {
		return app.isPackaged ?
			path.join(process.resourcesPath, 'app.asar', 'translations') :
			path.join(app.getAppPath(), 'translations')
	}

	loadFromDisk() {
		const fileList = fs.readdirSync(this.#getPath)

		for ( const thisFile of fileList ) {
			if ( ! thisFile.endsWith('.json') ) { continue }
			const thisKey = thisFile.replace('.json', '')
			try {
				this.#langSets[thisKey] = JSON.parse(fs.readFileSync(path.join(this.#getPath, thisFile)))
				appState.log.addGood(`Added Language ${thisFile} :: ${this.#langSets[thisKey].languageName}`)
			} catch (err) {
				appState.log.addError(`Bad Language File "${thisFile}" :: ${err.message}`)
			}
		}
		return
	}

	saveToDisk() {
		const outputObject = {
			languageName : 'English',
		}
		for ( const thisItem of [...this.#translationMemory].sort() ) {
			outputObject[thisItem] = thisItem
		}
		fs.writeFileSync(path.join(__dirname, '..', '..', 'translations', 'build', 'translator-output.json'), JSON.stringify(outputObject, null, 4))
	}

	eventString(_event, text) {
		if ( appState.debug ) { this.#translationMemory.add(text) }
		if ( appState.settings.get('langCode') === 'en-US' ) {
			return text
		}
		
		const thisEntry = this.#langSets?.[appState.settings.get('langCode')]?.[text] ?? null
		return typeof thisEntry !== 'undefined' && thisEntry !== null ? thisEntry : text
	}

	string(text) { return this.eventString(null, text) }
}

function getMenu() {
	const isMac = process.platform === 'darwin'
	return [
	// { role: 'appMenu' }
		...(!isMac ? [] : [{
			label   : app.name,
			submenu : [
				{ role : 'about' },
				{ type : 'separator' },
				{ role : 'services' },
				{ type : 'separator' },
				{ role : 'hide' },
				{ role : 'hideOthers' },
				{ role : 'unhide' },
				{ type : 'separator' },
				{ role : 'quit' }
			],
		}]),
		// { role: 'fileMenu' }
		{
			label   : appState.i18n.string('File'),
			submenu : [
				isMac ? { role : 'close' } : { role : 'quit' }
			],
		},
		// { role: 'editMenu' }
		{
			label   : appState.i18n.string('Edit'),
			submenu : [
				{ role : 'undo' },
				{ role : 'redo' },
				{ type : 'separator' },
				{ role : 'cut' },
				{ role : 'copy' },
				{ role : 'paste' },
				{ role : 'delete' },
				{ type : 'separator' },
				{ role : 'selectAll' },
			],
		},
		// { role: 'viewMenu' }
		{
			label : appState.i18n.string('View'),
			submenu : [
				{
					accelerator : 'CmdOrCtrl+1',
					label : appState.i18n.string('Show Messages'),
					click : async () => {
						appState.win.webContents.send('settings:showWindow', 'home')
					},
				},
				{
					accelerator : 'CmdOrCtrl+2',
					label : appState.i18n.string('Connections'),
					click : async () => {
						appState.win.webContents.send('settings:showWindow', 'connect')
					},
				},
				{
					accelerator : 'CmdOrCtrl+3',
					label : appState.i18n.string('Settings & Log'),
					click : async () => {
						appState.win.webContents.send('settings:showWindow', 'settings')
					},
				},
				...(appState.debug ? [
					{ type : 'separator' },
					{ role : 'reload' },
					{ role : 'forceReload' },
				]:[]),
				{ type : 'separator' },
				{ role : 'resetZoom' },
				{ role : 'zoomIn' },
				{ role : 'zoomOut' },
				{ type : 'separator' },
				{ role : 'togglefullscreen' }
			],
		},
		// { role: 'windowMenu' }
		{
			label : appState.i18n.string('Window'),
			submenu : [
				{ role : 'minimize' },
				...(isMac
					? [
						{ type : 'separator' },
						{ role : 'front' },
						{ type : 'separator' },
						{ role : 'window' }
					]
					: [
						{ role : 'close' }
					])
			],
		},
		{
			role : 'help',
			submenu : [
				{ role : 'about', label :  appState.i18n.string('About') },
				{
					label : appState.i18n.string('Message Info'),
					click : async () => {
						appState.win.webContents.send('settings:showWindow', 'help')
					},
				},
				{
					label : appState.i18n.string('GitHub'),
					click : async () => {
						await shell.openExternal('https://github.com/jtsage/osc-proxy-spy')
					},
				},
				{
					label : appState.i18n.string('Search Issues'),
					click : async () => {
						await shell.openExternal('https://github.com/jtsage/osc-proxy-spy/issues')
					},
				},
			],
		}
	]
}


const appState = {
	debug          : !app.isPackaged,
	i18n           : null,
	log            : null,
	oscConnections : [null, null, null, null, null, null, null, null, null],
	RENDER         : path.join(__dirname, '..', 'render'),
	settings       : null,
	win            : null,
}

appState.log      = new Logger()
appState.settings = new Settings()
appState.i18n     = new Translator()

module.exports = {
	appState : appState,
	getMenu  : getMenu,
}