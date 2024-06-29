/*                   ____                      ____              
 *     ___  ___  ___|  _ \ _ __ _____  ___   _/ ___| _ __  _   _ 
 *    / _ \/ __|/ __| |_) | '__/ _ \ \/ / | | \___ \| '_ \| | | |
 *   | (_) \__ \ (__|  __/| | | (_) >  <| |_| |___) | |_) | |_| |
 *    \___/|___/\___|_|   |_|  \___/_/\_\\__, |____/| .__/ \__, |
 *                                       |___/      |_|    |___/ 
 * (c) 2024 JTSage <https://github.com/jtsage/osc-proxy-spy> */

const {contextBridge, ipcRenderer} = require('electron')

contextBridge.exposeInMainWorld(
	'i18n', {
		dumpMemory : ()         => ipcRenderer.invoke('settings:dumpTranslationMemory'),
		get        : ()         => ipcRenderer.invoke('settings:get', 'langCode'),
		list       : ()         => ipcRenderer.invoke('i18n:getLangList'),
		set        : (code)     => ipcRenderer.invoke('i18n:set', code),
		string     : (key)      => ipcRenderer.invoke('i18n:string', key),
	}
)

contextBridge.exposeInMainWorld(
	'settings', {
		getConnection     : (number)  => ipcRenderer.invoke('settings:read:connection', number),
		reopenConnections : ()        => ipcRenderer.invoke('settings:reopen:connections'),
		setConnection     : (options) => ipcRenderer.invoke('settings:write:connection', options),

		get     : (settingName)                    => ipcRenderer.invoke('settings:get', settingName),
		isDebug : ()                               => ipcRenderer.invoke('settings:isDebug'),
		set     : (settingName, value)             => ipcRenderer.invoke('settings:set', settingName, value),
		toggle  : (settingName, forceValue = null) => ipcRenderer.invoke('settings:toggle', settingName, forceValue),

		networks   : () => ipcRenderer.invoke('settings:networks'),
		
		receive   : ( channel, func ) => {
			const validChannels = new Set([
				'settings:showWindow',
			])
		
			if ( validChannels.has( channel ) ) {
				ipcRenderer.on( channel, ( _, ...args ) => func( ...args ))
			}
		},
	}
)


contextBridge.exposeInMainWorld(
	'osc', {
		send : (connection, packet) => ipcRenderer.invoke('osc:send', connection, packet),

		receive   : ( channel, func ) => {
			const validChannels = new Set([
				'osc:data',
				'osc:tick',
				'osc:log',
			])
		
			if ( validChannels.has( channel ) ) {
				ipcRenderer.on( channel, ( _, ...args ) => func( ...args ))
			}
		},
	}
)