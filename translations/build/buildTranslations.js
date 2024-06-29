/*                   ____                      ____              
 *     ___  ___  ___|  _ \ _ __ _____  ___   _/ ___| _ __  _   _ 
 *    / _ \/ __|/ __| |_) | '__/ _ \ \/ / | | \___ \| '_ \| | | |
 *   | (_) \__ \ (__|  __/| | | (_) >  <| |_| |___) | |_) | |_| |
 *    \___/|___/\___|_|   |_|  \___/_/\_\\__, |____/| .__/ \__, |
 *                                       |___/      |_|    |___/ 
 * (c) 2024 JTSage <https://github.com/jtsage/osc-proxy-spy> */
/* eslint-disable no-console */

// Language file clean & sync
// For full operation, requires a deepL api key in <project_root>/.deepl_key
//   - If the deepL key is not found, defaults to syncing with the english translation instead

const path        = require('node:path')
const fs          = require('node:fs')

const testPath       = path.join(__dirname, '..')
const baseLocaleData = JSON.parse(fs.readFileSync(path.join(__dirname, 'translator-output.json')))
const baseLocaleKeys = new Set(Object.keys(baseLocaleData).sort(Intl.Collator().compare))

const deepl          = require('deepl-node')
let   deeplKey       = 'xxx'

if ( fs.existsSync(path.join(__dirname, '..', '..', '.deepl_key'))) {
	deeplKey = fs.readFileSync(path.join(__dirname, '..', '..', '.deepl_key'), 'utf8').trim()
}

const translator     = new deepl.Translator(deeplKey)

const fileMap = {
	de : 'DE',
	es : 'ES',
	fr : 'FR',
	ru : 'RU',
}

checkFiles().catch((err) => {
	console.error(`Unexpected error: ${err}`)
}).finally(() => {
	console.log('done')
})

async function checkFiles() {
	const fileChecks = []
	for ( const thisFileName of Object.keys(fileMap) ) {
		fileChecks.push(testFile(thisFileName).then((contents) => { fileWriter(contents, thisFileName) }))
	}

	return Promise.allSettled(fileChecks)
}

async function testFile(file) {
	let thisFile = {}

	try {
		thisFile = JSON.parse(fs.readFileSync(path.join(testPath, `${file}.json`)))
		const thisFileKeys = new Set(Object.keys(thisFile))
		const extraKeys    = new Set([...thisFileKeys].filter((x) => !baseLocaleKeys.has(x)))
		const missingKeys  = new Set([...baseLocaleKeys].filter((x) => !thisFileKeys.has(x)))

		if ( extraKeys.size !== 0 ) {
			console.log(`${file} :: Extra keys removed : ${[...extraKeys].join(', ')}`)
			for ( const thisKey of extraKeys ) { delete thisFile[thisKey] }
		}
		if ( missingKeys.size !== 0 ) {
			console.log(`${file} :: Missing keys added : ${[...missingKeys].join(', ')}`)
			const stringsToTranslate = [...missingKeys].map((x) => baseLocaleData[x])

			await translator.translateText(
				stringsToTranslate,
				'en',
				fileMap[file]
			).then((results) => {
				for ( const [idx, thisKey] of [...missingKeys].entries() ) {
					thisFile[thisKey] = results[idx].text
				}
				console.log(`${file} :: Got Translated Data`)
			}).catch((err) => {
				for ( const thisKey of missingKeys ) {
					thisFile[thisKey] = baseLocaleData[thisKey]
				}
				console.error(`${file} :: Translation failed, added english : ${err}`)
			})
		}
	} catch (err) {
		console.error(`Could not process ${file} :: ${err}`)
	}

	return thisFile
}

function fileWriter(data, file) {
	console.log(`${file} :: Writing Clean File`)
	const keysToWrite = Object.keys(data).sort(Intl.Collator().compare)
	const longestKey  = keysToWrite.reduce((a, b) => a.length <= b.length ? b : a).length
	const fileLines   = []

	for ( const thisKey of keysToWrite ) {
		fileLines.push(`\t"${thisKey}"${' '.padEnd(longestKey - thisKey.length)}: ${JSON.stringify(data[thisKey])}`)
	}

	fs.writeFileSync(path.join(testPath, `${file}.json`), `{\n${fileLines.join(',\n')}\n}\n`)
}
