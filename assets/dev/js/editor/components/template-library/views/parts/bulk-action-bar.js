const { SAVE_CONTEXTS } = require( 'elementor-templates/constants' );
module.exports = Marionette.ItemView.extend( {
	template: '#tmpl-elementor-template-library-bulk-selection-action-bar',

	className: 'bulk-selection-action-bar',

	ui: {
		bulkSelectionActionBar: '',
		bulkSelectedCount: '.selected-count',
		clearBulkSelections: '.clear-bulk-selections',
		bulkMove: '.bulk-move',
		bulkCopy: 'bulk-copy',
		bulkDelete: '.bulk-delete',
	},

	events: {
		'click @ui.clearBulkSelections': 'onClearBulkSelections',
		'mouseenter @ui.bulkMove': 'onHoverBulkAction',
		'mouseenter @ui.bulkCopy': 'onHoverBulkAction',
		'click @ui.bulkMove': 'onClickBulkMove',
		'click @ui.bulkCopy': 'onClickBulkCopy',
		'click @ui.bulkDelete': 'onClickBulkDelete',
	},

	onRender() {
		const selectedCount = elementor.templates.getBulkSelectionItems().size;

		this.ui.bulkSelectedCount.html( `${ selectedCount } Selected` );
	},

	onClearBulkSelections() {
		elementor.templates.clearBulkSelectionItems();
		elementor.templates.onBulkSelectAllCheckbox();

		this.destroy();
	},

	deselectAllBulkItems() {
		if ( 'list' === elementor.templates.getViewSelection() || 'local' === elementor.templates.getFilter( 'source' ) ) {
			this.ui.bulkSelectAllCheckbox.prop( 'checked', false ).trigger( 'change' );
		} else {
			document.querySelectorAll( '.bulk-selected-item' ).forEach( function( item ) {
				item.classList.remove( 'bulk-selected-item' );
			} );
		}
	},

	onClickBulkDelete() {
		this.ui.bulkActionBarDelete.toggleClass( 'disabled' );

		elementor.templates.onBulkDeleteClick()
			.finally( () => {
				this.ui.bulkActionBarDelete.toggleClass( 'disabled' );
				elementor.templates.layout.handleBulkActionBar();
			} );
	},

	onHoverBulkAction() {
		if ( this.hasFolderInBulkSelection() ) {
			this.ui.bulkMove.find( 'i' ).css( 'cursor', 'not-allowed' );
			this.ui.bulkCopy.find( 'i' ).css( 'cursor', 'not-allowed' );
		} else {
			this.ui.bulkMove.find( 'i' ).css( 'cursor', 'pointer' );
			this.ui.bulkCopy.find( 'i' ).css( 'cursor', 'pointer' );
		}
	},

	onClickBulkMove() {
		if ( this.hasFolderInBulkSelection() ) {
			return;
		}

		$e.route( 'library/save-template', {
			model: this.model,
			context: SAVE_CONTEXTS.BULK_MOVE,
		} );
	},

	hasFolderInBulkSelection() {
		const bulkSelectedItems = elementor.templates.getBulkSelectionItems();

		return this.collection.some( ( model ) => {
			const templateId = model.get( 'template_id' );
			const type = model.get( 'type' );

			return bulkSelectedItems.has( templateId ) && 'folder' === type;
		} );
	},

	onClickBulkCopy() {
		if ( this.hasFolderInBulkSelection() ) {
			return;
		}

		$e.route( 'library/save-template', {
			model: this.model,
			context: SAVE_CONTEXTS.BULK_COPY,
		} );
	},
} );
