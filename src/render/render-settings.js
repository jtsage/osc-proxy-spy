/*                   ____                      ____              
 *     ___  ___  ___|  _ \ _ __ _____  ___   _/ ___| _ __  _   _ 
 *    / _ \/ __|/ __| |_) | '__/ _ \ \/ / | | \___ \| '_ \| | | |
 *   | (_) \__ \ (__|  __/| | | (_) >  <| |_| |___) | |_) | |_| |
 *    \___/|___/\___|_|   |_|  \___/_/\_\\__, |____/| .__/ \__, |
 *                                       |___/      |_|    |___/ 
 * (c) 2024 JTSage <https://github.com/jtsage/osc-proxy-spy> */

/* global Util */


// Object.fromEntries(new FormData(Util.byId('connect-001-form')))

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

	window.settings.connection(connectSend).then((_result) => {
		// do something with the result!
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
	for ( const element of Util.byId('connect-tab-pane').getElementsByTagName('input')) {
		element.addEventListener('blur', (e) => clientFormBlur(e))
	}
	for ( const element of Util.byId('connect-tab-pane').querySelectorAll('button[type="submit"]')) {
		element.addEventListener('click', (e) => {clientFormSave(e)})
	}
	processI18N()
})