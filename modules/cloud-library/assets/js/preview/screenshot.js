/* global ElementorScreenshotConfig */
import { domToPng, createContext } from 'modern-screenshot';

class Screenshot extends elementorModules.ViewModule {
	getDefaultSettings() {
		return {
			empty_content_headline: 'Empty Content.',
			crop: {
				width: ElementorScreenshotConfig?.crop?.width || 1200,
				height: ElementorScreenshotConfig?.crop?.height || 1500,
			},
			timeout: 15000, // Wait until screenshot taken or fail in 15 secs.
			render_timeout: 5000, // Wait until all elements are loaded or 5 sec and then take screenshot.
			timerLabel: `${ ElementorScreenshotConfig.post_id } - timer`,
			isDebug: elementorCommonConfig.isElementorDebug,
			...ElementorScreenshotConfig,
		};
	}

	getDefaultElements() {
		const $elementor = jQuery( ElementorScreenshotConfig.selector );
		return {
			$elementor,
			$notElementorElements: elementorCommon.elements.$body.find( '> *:not(style, link)' ).not( $elementor ),
		};
	}

	onInit() {
		super.onInit();
		this.log( 'Screenshot init', 'time' );
		this.timeoutTimer = setTimeout( this.screenshotFailed.bind( this ), this.getSettings( 'timeout' ) );
		return this.captureScreenshot();
	}

	async captureScreenshot() {
		if ( ! this.elements.$elementor.length && ! this.getSettings( 'kit_id' ) ) {
			elementorCommon.helpers.consoleWarn(
				'Screenshots: The content of this page is empty, the module will create fake content just for this screenshot.',
			);
			this.createFakeContent();
		}

		try {
			// Get actual content dimensions
			const contentDimensions = this.getContentDimensions();

			// Create a reusable context for better performance
			const context = await createContext( this.elements.$elementor[ 0 ], {
				quality: 1,
				scale: 2, // For retina displays
				cacheBust: true,
				skipFonts: false,
				timeout: this.getSettings( 'render_timeout' ),
			} );

			// Take the screenshot with content dimensions
			const dataUrl = await domToPng( context, {
				width: contentDimensions.width,
				height: contentDimensions.height,
				style: {
					transform: `translate(-${ contentDimensions.left }px, -${ contentDimensions.top }px)`,
				},
			} );

			// Create image element for cropping
			const image = await this.createImageElement( dataUrl );

			// Crop the image to maintain aspect ratio within max dimensions
			const canvas = await this.cropCanvas( image );

			// Save the screenshot
			const url = await this.save( canvas );

			this.screenshotSucceed( url );
		} catch ( error ) {
			this.screenshotFailed( error );
		}
	}

	getContentDimensions() {
		const $content = this.elements.$elementor;
		const contentRect = $content[ 0 ].getBoundingClientRect();
		const sections = $content.find( '.elementor-section-wrap > .elementor-section, .elementor > .elementor-section' );

		let minTop = Infinity;
		let maxBottom = 0;
		let minLeft = Infinity;
		let maxRight = 0;

		// Find the actual content boundaries by checking all sections
		sections.each( ( _, section ) => {
			const rect = section.getBoundingClientRect();
			minTop = Math.min( minTop, rect.top );
			maxBottom = Math.max( maxBottom, rect.bottom );
			minLeft = Math.min( minLeft, rect.left );
			maxRight = Math.max( maxRight, rect.right );
		} );

		// If no sections found, use the container dimensions
		if ( minTop === Infinity ) {
			return {
				top: contentRect.top,
				left: contentRect.left,
				width: contentRect.width,
				height: contentRect.height,
			};
		}

		const width = maxRight - minLeft;
		const height = maxBottom - minTop;

		// Ensure minimum dimensions
		const minWidth = 400;
		const minHeight = 300;

		return {
			top: minTop,
			left: minLeft,
			width: Math.max( width, minWidth ),
			height: Math.max( height, minHeight ),
		};
	}

	createFakeContent() {
		this.elements.$elementor = jQuery( '<div>' ).css( {
			height: this.getSettings( 'crop.height' ),
			width: this.getSettings( 'crop.width' ),
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'center',
		} );

		this.elements.$elementor.append(
			jQuery( '<h1>' ).css( { fontSize: '85px' } ).html( this.getSettings( 'empty_content_headline' ) ),
		);

		document.body.prepend( this.elements.$elementor );
	}

	createImageElement( dataUrl ) {
		const image = new Image();
		image.src = dataUrl;

		return new Promise( ( resolve ) => {
			image.onload = () => resolve( image );
		} );
	}

	cropCanvas( image ) {
		const maxWidth = this.getSettings( 'crop.width' );
		const maxHeight = this.getSettings( 'crop.height' );

		const cropCanvas = document.createElement( 'canvas' );
		const cropContext = cropCanvas.getContext( '2d' );

		// Calculate dimensions maintaining aspect ratio
		let width = image.width;
		let height = image.height;

		if ( width > maxWidth ) {
			height = ( maxWidth / width ) * height;
			width = maxWidth;
		}

		if ( height > maxHeight ) {
			width = ( maxHeight / height ) * width;
			height = maxHeight;
		}

		cropCanvas.width = width;
		cropCanvas.height = height;

		cropContext.drawImage( image, 0, 0, image.width, image.height, 0, 0, width, height );

		return Promise.resolve( cropCanvas );
	}

	save( canvas ) {
		const { key, action } = this.getSaveAction();

		const data = {
			[ key ]: this.getSettings( key ),
			screenshot: canvas.toDataURL( 'image/png' ),
		};

		return new Promise( ( resolve, reject ) => {
			if ( 'kit_id' === key ) {
				return resolve( data.screenshot );
			}

			elementorCommon.ajax.addRequest( action, {
				data,
				success: ( url ) => {
					this.log( `Screenshot created: ${ encodeURI( url ) }` );
					resolve( url );
				},
				error: () => {
					this.log( 'Failed to create screenshot.' );
					reject();
				},
			} );
		} );
	}

	screenshotSucceed( imageUrl ) {
		this.screenshotDone( true, imageUrl );
	}

	screenshotFailed( e ) {
		this.log( e, null );
		this.markAsFailed( e ).then( () => this.screenshotDone( false ) );
	}

	screenshotDone( success, imageUrl = null ) {
		clearTimeout( this.timeoutTimer );
		this.timeoutTimer = null;
		const { message, key } = this.getSaveAction();

		window.parent.postMessage( {
			name: message,
			success,
			id: this.getSettings( key ),
			imageUrl,
		}, '*' );

		this.log( `Screenshot ${ success ? 'Succeed' : 'Failed' }.`, 'timeEnd' );
	}

	markAsFailed( e ) {
		return new Promise( ( resolve, reject ) => {
			const templateId = this.getSettings( 'template_id' );
			const postId = this.getSettings( 'post_id' );
			const kitId = this.getSettings( 'kit_id' );

			if ( kitId ) {
				resolve();
			} else {
				const route = templateId ? 'template_screenshot_failed' : 'screenshot_failed';

				const data = templateId ? {
					template_id: templateId,
					error: e.message || e.toString(),
				} : {
					post_id: postId,
				};

				elementorCommon.ajax.addRequest( route, {
					data,
					success: () => {
						this.log( 'Marked as failed.' );
						resolve();
					},
					error: () => {
						this.log( 'Failed to mark this screenshot as failed.' );
						reject();
					},
				} );
			}
		} );
	}

	getSaveAction() {
		const config = this.getSettings();

		if ( config.kit_id ) {
			return {
				message: 'kit-screenshot-done',
				action: 'update_kit_preview',
				key: 'kit_id',
			};
		}

		if ( config.template_id ) {
			return {
				message: 'library/capture-screenshot-done',
				action: 'save_template_screenshot',
				key: 'template_id',
			};
		}

		return {
			message: 'capture-screenshot-done',
			action: 'screenshot_save',
			key: 'post_id',
		};
	}

	log( message, timerMethod = 'log' ) {
		if ( ! this.getSettings( 'isDebug' ) ) {
			return;
		}

		if ( ! timerMethod ) {
			console.log( message ); // eslint-disable-line no-console
			return;
		}

		const timerLabel = this.getSettings( 'timerLabel' );
		console[ timerMethod ]( timerLabel, message ); // eslint-disable-line no-console
	}
}

jQuery( () => {
	new Screenshot();
} );
