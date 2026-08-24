import { defineConfig } from 'vite'
import path from 'node:path'

// https://vitejs.dev/config
export default defineConfig( {
	root  : path.resolve( __dirname, 'src/render' ),
	build : {
		copyPublicDir : true,
		
		rollupOptions : {
			output : { dir : '.vite/renderer/main_window' },
			input  : {
				main : path.resolve( __dirname, 'src/render/index.html' ),
			},
		},
	},
	css : {
		preprocessorOptions : {
			scss : {
				api                 : 'modern-compiler',
				silenceDeprecations : [
					'import',
					// 'mixed-decls',
					'color-functions',
					'global-builtin',
				],
				quietDeps : true,
			},
		},
	},
} )
