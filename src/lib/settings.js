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
				// {
				// 	label : appState.i18n.string('Clear all Connections'),
				// 	click : async () => {
				// 		for ( let i = 1; i <= 8; i++ ) {
				// 			appState.settings.saveConnection({number : i, data : {}})
				// 		}
				// 		appState.win.webContents.send('settings:refresh')
				// 	},
				// },
				// { type : 'separator' },
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
					label : appState.i18n.string('Settings'),
					click : async () => {
						appState.win.webContents.send('settings:showWindow', 'settings')
					},
				},
				// pages here
				{ type : 'separator' },
				{ role : 'reload' },
				{ role : 'forceReload' },
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

module.exports = {
	appState : appState,
	getMenu  : getMenu,
}