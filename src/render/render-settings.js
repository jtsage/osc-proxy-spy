/*                   ____                      ____              
 *     ___  ___  ___|  _ \ _ __ _____  ___   _/ ___| _ __  _   _ 
 *    / _ \/ __|/ __| |_) | '__/ _ \ \/ / | | \___ \| '_ \| | | |
 *   | (_) \__ \ (__|  __/| | | (_) >  <| |_| |___) | |_) | |_| |
 *    \___/|___/\___|_|   |_|  \___/_/\_\\__, |____/| .__/ \__, |
 *                                       |___/      |_|    |___/ 
 * (c) 2024 JTSage <https://github.com/jtsage/osc-proxy-spy> */

/* global Util */

function clientFormSave(e) {
	e.preventDefault()

	const thisForm       = e.target.tagName === 'BUTTON' ? e.target.form : e.target.parentElement.form

	if ( ! thisForm.checkValidity() ) { thisForm.reportValidity(); return }

	const connectSend = {
		number : parseInt(thisForm.id.slice(8, 11)),
		data   : {},
	}

	for ( const [key, value] of new FormData(thisForm) ) {
		connectSend.data[key.slice(12)] = value
	}

	connectSend.data.active = (connectSend.data?.active === 'on')
	connectSend.data['shared-socket'] = (connectSend.data?.['shared-socket'] === 'on')

	window.settings.saveConnection(connectSend).then((result) => {
		const opDiv = result ? 'operation-good' : 'operation-bad'
		Util.byId(opDiv).classList.remove('d-none')
		Util.byId(opDiv).classList.replace('hide', 'show')
		
		setTimeout(() => { Util.byId(opDiv).classList.replace('show', 'hide')}, 1000)
		setTimeout(() => { Util.byId(opDiv).classList.add('d-none')}, 1175)
		// TODO: do something with the result, it's T/F
	})
}

function clientFormBlur(e) {
	const thisElement    = e.target.id
	const thisValue      = e.target.value
	const thisForm       = e.target.form
	const thisFormPrefix = e.target.form.id.slice(0, 11)

	if ( ! thisForm.checkValidity() ) { thisForm.reportValidity(); return }

	if ( thisElement.endsWith('-name') && thisValue !== '' ) {
		Util.byId(`${thisFormPrefix}-active`).checked = true
	}

	if ( thisElement.endsWith('-shared-socket') && thisValue !== 'on' ) { return }
	if (
		( thisElement.endsWith('-in-port') || thisElement.endsWith('-out-port') || thisElement.endsWith('-shared-socket') ) &&
		( Util.byId(`${thisFormPrefix}-in-port`).value !== Util.byId(`${thisFormPrefix}-out-port`).value )
	) {
		Util.byId(`${thisFormPrefix}-shared-socket`).checked = false
	}
}

function doNullString(value) { return value === null ? '' : value }

function populateConnection(number, details) {
	const prefix = `connect-00${number}`
	for ( const [key, value] of Object.entries(details) ) {
		switch ( key ) {
			case 'name' :
				Util.byId(`${prefix}-name`).value = doNullString(value)
				break
			case 'isActive' :
				Util.byId(`${prefix}-active`).checked = value
				break
			case 'sharedSocket' :
				Util.byId(`${prefix}-shared-socket`).checked = value
				break
			case 'portIn' :
				Util.byId(`${prefix}-in-port`).value = doNullString(value)
				break
			case 'portOut' :
				Util.byId(`${prefix}-out-port`).value = doNullString(value)
				break
			case 'addressIn' :
				if ( value === null ) { continue }
				Util.byId(`${prefix}-in-address`).value = value
				break
			case 'addressOut' :
				Util.byId(`${prefix}-out-address`).value = doNullString(value)
				break
			case 'proxyInPort' :
				Util.byId(`${prefix}-proxy-in-port`).value = doNullString(value)
				break
			case 'proxyInAddress' :
				if ( value === null ) { continue }
				Util.byId(`${prefix}-proxy-in-address`).value = value
				break
			case 'heartbeatTime' :
				Util.byId(`${prefix}-heartbeat-time`).value = doNullString(value)
				break
			default:
				break
		}
	}
	for ( let i = 0; i <= 2; i++ ) {
		const thisProxyPair = details?.proxyPairs[i]
		
		Util.byId(`${prefix}-proxy-00${i+1}-port`).value    = doNullString(thisProxyPair?.port ?? null)
		Util.byId(`${prefix}-proxy-00${i+1}-address`).value = doNullString(thisProxyPair?.address ?? null)
	}
	
}

window.settings.receive('settings:networks', (networks) => {
	const netDropHTML  = networks.map((x) => `<option value="${x}">${x}</option>`)
	for ( const element of Util.queryA('.network-drop') ) {
		element.innerHTML = netDropHTML
	}
})

async function processI18N() {
	for ( const element of Util.queryA('[data-i18n-string') ) {
		window.i18n.string(element.textContent).then((value) => { element.textContent = value })
	}
}

window.addEventListener('DOMContentLoaded', () => {
	const connectionSettingTemplate = Util.byId('connection-template').innerHTML

	for ( let i = 1; i <= 8; i++ ) {
		Util.byId(`connect-00${i}`).innerHTML = connectionSettingTemplate.replaceAll('-000-', `-00${i}-`)
	}

	window.settings.networks().then((networks) => {
		const netDropHTML  = networks.map((x) => `<option value="${x}">${x}</option>`)
		for ( const element of Util.queryA('.network-drop') ) {
			element.innerHTML = netDropHTML
		}
	})

	for ( let i = 1; i <= 8; i++ ) {
		window.settings.getConnection(i).then((details) => populateConnection(i, details))
	}

	for ( const element of Util.byId('connect-tab-pane').getElementsByTagName('input')) {
		element.addEventListener('blur', (e) => clientFormBlur(e))
	}
	for ( const element of Util.byId('connect-tab-pane').querySelectorAll('button[type="submit"]')) {
		element.addEventListener('click', (e) => {clientFormSave(e)})
	}
	processI18N()
})