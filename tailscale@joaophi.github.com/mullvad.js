import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

// Translations
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

/**
 * Convert a country code to a flag emoji
 * @param {string} countryCode - The ISO 3166-1 alpha-2 country code
 * @returns {string} The flag emoji for the country
 */
function getCountryFlag(countryCode) {
  if (!countryCode) return '';

  // Convert country code to flag emoji
  // Each letter in the country code is converted to a regional indicator symbol
  // by adding 127397 to its Unicode code point
  return countryCode
    .split('')
    .map(char => String.fromCodePoint(char.charCodeAt(0) + 127397))
    .join('');
}

/**
 * This module provides UI components for selecting Mullvad exit nodes in the Tailscale GNOME extension.
 * It includes custom menu items for displaying location information and nodes, and a modal dialog for selecting exit nodes.
 */

/**
 * A menu item representing a Mullvad exit node
 *
 * @class MullvadNodeItem
 * @extends PopupMenu.PopupBaseMenuItem
 */
export const MullvadNodeItem = GObject.registerClass({
  Properties: {
    /**
     * Whether this node is currently selected
     */
    'selected': GObject.ParamSpec.boolean(
      'selected', 'Selected', 'Whether this node is selected',
      GObject.ParamFlags.READWRITE,
      false)
  }
}, class MullvadNodeItem extends PopupMenu.PopupBaseMenuItem {
  /**
   * Create a new MullvadNodeItem
   *
   * @param {string} name - The node name
   * @param {string} nodeId - The node ID
   * @param {number} priority - The node priority (lower is better)
   * @param {boolean} isSelected - Whether this node is currently selected
   */
  _init(name, nodeId, priority, isSelected) {
    super._init({
      style_class: 'mullvad-node-item popup-menu-item',
      activate: true,
    });

    this.name = name;
    this.nodeId = nodeId;
    this.priority = priority;
    this._selected = isSelected || false;

    // Add indentation to visually distinguish from location items
    this.style = 'padding-left: 24px; margin-top: 2px; margin-bottom: 2px;';

    this._createUI();
    this.connect('notify::selected', () => this._updateSelection());
  }

  /**
   * Create and set up the UI elements
   * @private
   */
  _createUI() {
    // Main content container
    const contentBox = new St.BoxLayout({
      style_class: 'mullvad-node-content',
      vertical: true,
      x_expand: true,
      x_align: Clutter.ActorAlign.START,
      y_align: Clutter.ActorAlign.CENTER
    });
    this.add_child(contentBox);

    // Node name
    this.nameLabel = new St.Label({
      style_class: 'mullvad-node-name',
      text: this.name,
      x_align: Clutter.ActorAlign.START
    });
    contentBox.add_child(this.nameLabel);

    // Selection indicator
    this.checkIcon = new St.Icon({
      style_class: 'mullvad-selection-icon',
      icon_name: 'object-select-symbolic',
      icon_size: 16,
      visible: this._selected,
      x_align: Clutter.ActorAlign.END,
      y_align: Clutter.ActorAlign.CENTER
    });
    this.add_child(this.checkIcon);

    // Apply initial selection state
    this._updateSelection();
  }

  /**
   * Get the selected state
   * @returns {boolean} Whether this item is selected
   */
  get selected() {
    return this._selected;
  }

  /**
   * Set the selected state
   * @param {boolean} value - The new selected state
   */
  set selected(value) {
    if (this._selected !== value) {
      this._selected = value;
      this.notify('selected');
    }
  }

  /**
   * Update the UI to reflect the current selection state
   * @private
   */
  _updateSelection() {
    this.checkIcon.visible = this._selected;

    if (this._selected) {
      this.add_style_pseudo_class('selected');
    } else {
      this.remove_style_pseudo_class('selected');
    }
  }

  /**
   * Override the activate method to emit the activate signal
   * This allows the item to be activated by keyboard or mouse
   *
   * @param {Clutter.Event} event - The event that triggered the activation
   */
  activate(event) {
    if (this._activatable) {
      this.emit('activate', event);
    }
  }
});

/**
 * A menu item representing a Mullvad exit node location (city/country)
 *
 * @class MullvadLocationItem
 * @extends PopupMenu.PopupBaseMenuItem
 */
export const MullvadLocationItem = GObject.registerClass({
  Properties: {
    /**
     * Whether this location is currently selected
     */
    'selected': GObject.ParamSpec.boolean(
      'selected', 'Selected', 'Whether this location is selected',
      GObject.ParamFlags.READWRITE,
      false),
    /**
     * Whether this location is expanded to show nodes
     */
    'expanded': GObject.ParamSpec.boolean(
      'expanded', 'Expanded', 'Whether this location is expanded to show nodes',
      GObject.ParamFlags.READWRITE,
      false)
  },
  Signals: {
    'expand-toggled': { param_types: [GObject.TYPE_BOOLEAN] }
  }
}, class MullvadLocationItem extends PopupMenu.PopupBaseMenuItem {
  /**
   * Create a new MullvadLocationItem
   *
   * @param {string} city - The city name
   * @param {string} country - The country name
   * @param {number} nodeCount - Number of available nodes at this location
   * @param {Object} bestNode - The best node object for this location
   * @param {Array} nodes - All nodes for this location
   * @param {string} countryCode - The country code (ISO 3166-1 alpha-2)
   */
  _init(city, country, nodeCount, bestNode, nodes, countryCode) {
    super._init({
      style_class: 'mullvad-location-item popup-menu-item',
      activate: true,
    });

    this.city = city;
    this.country = country;
    this.nodeCount = nodeCount;
    this.bestNode = bestNode;
    this.nodes = nodes;
    this.countryCode = countryCode;
    this._selected = false;
    this._expanded = false;

    this._createUI();
    this.connect('notify::selected', () => this._updateSelection());
    this.connect('notify::expanded', () => this._updateExpanded());
  }

  /**
   * Create and set up the UI elements
   * @private
   */
  _createUI() {
    // Main content container
    const contentBox = new St.BoxLayout({
      style_class: 'mullvad-location-content',
      vertical: true,
      x_expand: true
    });
    this.add_child(contentBox);

    // Title: City, Country (with country in bold)
    this.titleLabel = new St.Label({
      style_class: 'mullvad-location-title title',
    });
    // Set markup for bold country name
    this.titleLabel.clutter_text.set_markup(`${this.city} <b>${this.country}</b>`);
    contentBox.add_child(this.titleLabel);

    // Subtitle: Node count
    const nodesText = this.nodeCount === 1 ? _('node') : _('nodes');
    this.subtitleLabel = new St.Label({
      style_class: 'mullvad-location-subtitle subtitle',
      text: `${this.nodeCount} ${nodesText} online`,
    });
    contentBox.add_child(this.subtitleLabel);

    // Selection indicator
    this.checkIcon = new St.Icon({
      style_class: 'mullvad-selection-icon',
      icon_name: 'object-select-symbolic',
      icon_size: 16,
      visible: false,
      x_align: Clutter.ActorAlign.END,
      y_align: Clutter.ActorAlign.CENTER
    });
    this.add_child(this.checkIcon);

    // Country flag
    const flagEmoji = getCountryFlag(this.countryCode);
    this.flagLabel = new St.Label({
      style_class: 'mullvad-country-flag',
      text: flagEmoji,
      x_align: Clutter.ActorAlign.END,
      y_align: Clutter.ActorAlign.CENTER,
      style: 'font-size: 16px; margin-right: 8px;'
    });
    this.add_child(this.flagLabel);

    // Expand button
    this.expandButton = new St.Button({
      style_class: 'mullvad-expand-button icon-button',
      x_align: Clutter.ActorAlign.END,
      y_align: Clutter.ActorAlign.CENTER,
      can_focus: true
    });

    this.expandIcon = new St.Icon({
      style_class: 'mullvad-expand-icon',
      icon_name: 'go-down-symbolic',
      icon_size: 16
    });

    this.expandButton.set_child(this.expandIcon);
    this.expandButton.connect('clicked', (actor, event) => {
      // Stop propagation to prevent the item from being activated
      this.expanded = !this.expanded;
      this.emit('expand-toggled', this.expanded);
      return Clutter.EVENT_STOP;
    });

    this.add_child(this.expandButton);
  }

  /**
   * Update the UI to reflect the current expanded state
   * @private
   */
  _updateExpanded() {
    if (this._expanded) {
      this.expandIcon.icon_name = 'go-up-symbolic';
    } else {
      this.expandIcon.icon_name = 'go-down-symbolic';
    }
  }

  /**
   * Get the selected state
   * @returns {boolean} Whether this item is selected
   */
  get selected() {
    return this._selected;
  }

  /**
   * Set the selected state
   * @param {boolean} value - The new selected state
   */
  set selected(value) {
    if (this._selected !== value) {
      this._selected = value;
      this.notify('selected');
    }
  }

  /**
   * Get the expanded state
   * @returns {boolean} Whether this item is expanded
   */
  get expanded() {
    return this._expanded;
  }

  /**
   * Set the expanded state
   * @param {boolean} value - The new expanded state
   */
  set expanded(value) {
    if (this._expanded !== value) {
      this._expanded = value;
      this.notify('expanded');
    }
  }

  /**
   * Update the UI to reflect the current selection state
   * @private
   */
  _updateSelection() {
    this.checkIcon.visible = this._selected;

    if (this._selected) {
      this.add_style_pseudo_class('selected');
    } else {
      this.remove_style_pseudo_class('selected');
    }
  }

  /**
   * Override the activate method to emit the activate signal
   * This allows the item to be activated by keyboard or mouse
   *
   * @param {Clutter.Event} event - The event that triggered the activation
   */
  activate(event) {
    if (this._activatable) {
      this.emit('activate', event);
    }
  }
});

/**
 * Modal dialog for selecting Mullvad exit nodes
 *
 * @class MullvadExitNodeDialog
 * @extends ModalDialog.ModalDialog
 */
export const MullvadExitNodeDialog = GObject.registerClass(
  class MullvadExitNodeDialog extends ModalDialog.ModalDialog {
    /**
     * Create a new MullvadExitNodeDialog
     *
     * @param {Array} mullvadNodes - Array of available Mullvad nodes
     * @param {Object} tailscale - Tailscale instance to control exit node selection
     */
    _init(mullvadNodes, tailscale) {
      super._init({
        styleClass: 'mullvad-exit-node-dialog modal-dialog',
        destroyOnClose: true,
        shellReactive: true,
        shouldFadeIn: true,
        shouldFadeOut: true
      });

      this._initializeProperties(mullvadNodes, tailscale);
      this._setDialogSize();
      this._processNodeData();
      this._buildUI();
    }

    /**
     * Initialize dialog properties
     *
     * @param {Array} mullvadNodes - Array of available Mullvad nodes
     * @param {Object} tailscale - Tailscale instance
     * @private
     */
    _initializeProperties(mullvadNodes, tailscale) {
      this._nodes = mullvadNodes;
      this._tailscale = tailscale;
      this._selectedItem = null;
      this._searchQuery = '';
      this._locationItems = [];
    }

    /**
     * Set dialog size based on screen dimensions
     * @private
     */
    _setDialogSize() {
      const primaryMonitor = global.display.get_primary_monitor();
      const monitorGeometry = global.display.get_monitor_geometry(primaryMonitor);
      // Set width to 35% of screen width
      this.contentLayout.width = Math.floor(monitorGeometry.width * 0.35);
    }

    /**
     * Process node data to organize by location and find best nodes
     * @private
     */
    _processNodeData() {
      this._locationData = {};
      this._groupNodesByLocation();
      this._findBestNodesForLocations();
      this._removeInvalidLocations();
    }

    /**
     * Group nodes by city and country
     * @private
     */
    _groupNodesByLocation() {
      for (const node of this._nodes) {
        const country = node.location?.Country || 'Unknown';
        const city = node.location?.City || 'Unknown';
        const countryCode = node.location?.CountryCode || '';
        const locationKey = `${city} ${country}`;

        if (!this._locationData[locationKey]) {
          this._locationData[locationKey] = {
            city,
            country,
            countryCode,
            nodes: [],
            bestNode: null
          };
        }

        this._locationData[locationKey].nodes.push(node);
      }
    }

    /**
     * Find the best node for each location and count online nodes
     * @private
     */
    _findBestNodesForLocations() {
      Object.values(this._locationData).forEach(location => {
        const onlineNodes = location.nodes.filter(node => node.online);
        location.nodeCount = onlineNodes.length;

        if (onlineNodes.length > 0) {
          location.bestNode = this._findBestNode(onlineNodes);
        } else if (location.nodes.length > 0) {
          // Fallback to any node if no online nodes
          location.bestNode = location.nodes[0];
        }
      });
    }

    /**
     * Find the best node (the one with the lowest priority value)
     *
     * @param {Array} nodes - Array of nodes to search
     * @returns {Object} The node with the lowest priority
     * @private
     */
    _findBestNode(nodes) {
      return nodes.sort((a, b) => {
        const aPriority = a.location?.Priority || Number.MAX_SAFE_INTEGER;
        const bPriority = b.location?.Priority || Number.MAX_SAFE_INTEGER;
        return aPriority - bPriority;
      })[0];
    }

    /**
     * Remove locations with no best node or no online nodes
     * @private
     */
    _removeInvalidLocations() {
      Object.keys(this._locationData).forEach(key => {
        if (!this._locationData[key].bestNode || this._locationData[key].nodeCount === 0) {
          delete this._locationData[key];
        }
      });
    }

    /**
     * Build the dialog UI components
     * @private
     */
    _buildUI() {
      this._createHeader();
      this._createSearchBox();
      this._createLocationsList();
      this._setupEventHandlers();
      this._populateLocationsList();
    }

    /**
     * Create the dialog header with title and close button
     * @private
     */
    _createHeader() {
      const headerBox = new St.BoxLayout({
        style_class: 'mullvad-dialog-header',
        vertical: false,
        x_expand: true,
        y_expand: false,
        height: 28,
        y_align: Clutter.ActorAlign.START
      });

      // Dialog title (center, bold)
      const title = new St.Label({
        style_class: 'mullvad-dialog-title title',
        text: _('Select Exit Node'),
        x_expand: true,
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
        style: 'font-weight: bold;'
      });
      headerBox.add_child(title);

      // Close button (right side)
      const closeButton = new St.Button({
        style_class: 'window-close',
        x_align: Clutter.ActorAlign.END,
        y_align: Clutter.ActorAlign.CENTER
      });

      const closeIcon = new St.Icon({
        icon_name: 'window-close-symbolic',
        style_class: 'system-status-icon'
      });
      closeButton.set_child(closeIcon);
      closeButton.connect('clicked', this._onCancelClicked.bind(this));
      headerBox.add_child(closeButton);

      this.contentLayout.add_child(headerBox);
    }

    /**
     * Create the search box for filtering locations
     * @private
     */
    _createSearchBox() {
      const searchBox = new St.BoxLayout({
        style_class: 'mullvad-search-box',
        vertical: false,
        x_expand: true,
        margin_top: 12,
      });

      this._searchEntry = new St.Entry({
        style_class: 'mullvad-search-entry search-entry',
        hint_text: _('Search by City or Country...'),
        track_hover: true,
        can_focus: true,
        x_expand: true
      });

      // Add search icon
      const searchIcon = new St.Icon({
        icon_name: 'edit-find-symbolic',
        style_class: 'search-entry-icon'
      });
      this._searchEntry.set_primary_icon(searchIcon);

      // Add clear button
      const clearIcon = new St.Icon({
        icon_name: 'edit-clear-symbolic',
        style_class: 'search-entry-icon'
      });
      this._searchEntry.set_secondary_icon(clearIcon);

      searchBox.add_child(this._searchEntry);
      this.contentLayout.add_child(searchBox);
    }

    /**
     * Create the scrollable list view for locations
     * @private
     */
    _createLocationsList() {
      // Calculate height based on screen size
      const primaryMonitor = global.display.get_primary_monitor();
      const monitorHeight = global.display.get_monitor_geometry(primaryMonitor).height;
      const listHeight = Math.floor(monitorHeight * 0.4); // 40% of screen height

      // Scrollable list view
      this._scrollView = new St.ScrollView({
        style_class: 'mullvad-locations-scrollview',
        x_expand: true,
        y_expand: true,
        y_align: Clutter.ActorAlign.START,
        margin_top: 12,
        height: listHeight,
      });
      this._scrollView.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);

      // List container
      this._listBox = new St.BoxLayout({
        style_class: 'mullvad-locations-list boxed-list',
        vertical: true,
        x_expand: true
      });

      this._scrollView.add_child(this._listBox);
      this.contentLayout.add_child(this._scrollView);
    }

    /**
     * Set up event handlers for the dialog
     * @private
     */
    _setupEventHandlers() {
      // Set initial focus to search entry
      this.setInitialKeyFocus(this._searchEntry);

      // Connect search query changed event
      this._textChangedId = this._searchEntry.clutter_text.connect(
        'text-changed',
        this._onSearchQueryChanged.bind(this)
      );

      // Connect clear button clicked event
      this._clearIconClickedId = this._searchEntry.connect(
        'secondary-icon-clicked',
        () => {
          if (this._searchEntry && this._searchEntry.get_stage()) {
            this._searchEntry.set_text('');
          }
        }
      );

      // Add key binding for Escape key to close dialog
      this.connect('key-press-event', (actor, event) => {
        const symbol = event.get_key_symbol();
        if (symbol === Clutter.KEY_Escape) {
          this._onCancelClicked();
          return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
      });
    }

    /**
     * Populate the location list with filtered and sorted items
     * @private
     */
    _populateLocationsList() {
      this._clearList();

      const filteredLocations = this._getFilteredAndSortedLocations();

      if (filteredLocations.length === 0) {
        this._showNoResultsMessage();
        return;
      }

      this._createLocationItems(filteredLocations);
    }

    /**
     * Clear the list of existing items
     * @private
     */
    _clearList() {
      this._listBox.destroy_all_children();
      this._locationItems = [];
    }

    /**
     * Get locations filtered by search text and sorted alphabetically
     * @returns {Array} Filtered and sorted location objects
     * @private
     */
    _getFilteredAndSortedLocations() {
      const locations = Object.values(this._locationData);

      // Filter locations based on search text
      const filteredLocations = this._filterLocations(locations);

      // Sort locations alphabetically by country then city
      return this._sortLocationsByCountryAndCity(filteredLocations);
    }

    /**
     * Filter locations based on search query
     * @param {Array} locations - Array of location objects
     * @returns {Array} Filtered location objects
     * @private
     */
    _filterLocations(locations) {
      if (!this._searchQuery) {
        return locations;
      }

      const searchQuery = this._searchQuery.toLowerCase();
      return locations.filter(location => {
        const cityMatch = location.city.toLowerCase().includes(searchQuery);
        const countryMatch = location.country.toLowerCase().includes(searchQuery);
        return cityMatch || countryMatch;
      });
    }

    /**
     * Sort locations alphabetically by country then city
     * @param {Array} locations - Array of location objects
     * @returns {Array} Sorted location objects
     * @private
     */
    _sortLocationsByCountryAndCity(locations) {
      return [...locations].sort((a, b) => {
        if (a.country !== b.country) {
          return a.country.localeCompare(b.country);
        }
        return a.city.localeCompare(b.city);
      });
    }

    /**
     * Show a message when no locations match the search
     * @private
     */
    _showNoResultsMessage() {
      const noResultsBox = new St.BoxLayout({
        style_class: 'mullvad-no-results',
        vertical: true,
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER
      });

      const noResultsIcon = new St.Icon({
        icon_name: 'dialog-information-symbolic',
        icon_size: 32,
        style_class: 'mullvad-no-results-icon'
      });
      noResultsBox.add_child(noResultsIcon);

      const noResultsLabel = new St.Label({
        style_class: 'mullvad-no-results-label heading',
        text: _('No locations found')
      });
      noResultsBox.add_child(noResultsLabel);

      this._listBox.add_child(noResultsBox);
    }

    /**
     * Create location items for each location and add them to the list
     * @param {Array} locations - Array of location objects
     * @private
     */
    _createLocationItems(locations) {
      locations.forEach(location => {
        const locationItem = new MullvadLocationItem(
          location.city,
          location.country,
          location.nodeCount,
          location.bestNode,
          location.nodes,
          location.countryCode
        );

        // Check if this is the current exit node
        if (this._tailscale.exit_node === location.bestNode.id) {
          locationItem.selected = true;
          this._selectedItem = locationItem;
        }

        // Connect activation handler
        locationItem.connect('activate', () => {
          this._onLocationItemClicked(locationItem);
        });

        // Connect expand-toggled handler
        locationItem.connect('expand-toggled', (item, expanded) => {
          this._onLocationItemExpandToggled(locationItem, expanded);
        });

        // Make the item activatable
        locationItem._activatable = true;

        this._listBox.add_child(locationItem);
        this._locationItems.push(locationItem);
      });
    }

    /**
     * Handle location item expand/collapse event
     *
     * @param {MullvadLocationItem} locationItem - The location item that was expanded/collapsed
     * @param {boolean} expanded - Whether the item is expanded
     * @private
     */
    _onLocationItemExpandToggled(locationItem, expanded) {
      // Remove any existing node items for this location
      this._removeNodeItemsForLocation(locationItem);

      if (expanded) {
        // Create and add node items for this location
        this._createNodeItemsForLocation(locationItem);
      }
    }

    /**
     * Remove node items for a location
     *
     * @param {MullvadLocationItem} locationItem - The location item
     * @private
     */
    _removeNodeItemsForLocation(locationItem) {
      // Find the index of the location item
      const locationIndex = this._listBox.get_children().indexOf(locationItem);
      if (locationIndex === -1) return;

      // Get all children after this location item
      const children = this._listBox.get_children();

      // Collect all node items to remove
      const nodesToRemove = [];
      for (let i = locationIndex + 1; i < children.length; i++) {
        const child = children[i];
        if (child.constructor.name === 'MullvadNodeItem') {
          nodesToRemove.push(child);
        } else {
          // We've hit another location item, stop collecting
          break;
        }
      }

      // Remove all collected node items
      for (const child of nodesToRemove) {
        if (child.get_parent() === this._listBox) {
          this._listBox.remove_child(child);
        }
      }
    }

    /**
     * Create and add node items for a location
     *
     * @param {MullvadLocationItem} locationItem - The location item
     * @private
     */
    _createNodeItemsForLocation(locationItem) {
      // Find the index of the location item
      const locationIndex = this._listBox.get_children().indexOf(locationItem);
      if (locationIndex === -1) return;

      // Filter online nodes and sort by priority (lowest first)
      const onlineNodes = locationItem.nodes
        .filter(node => node.online)
        .sort((a, b) => {
          const aPriority = a.location?.Priority || Number.MAX_SAFE_INTEGER;
          const bPriority = b.location?.Priority || Number.MAX_SAFE_INTEGER;
          return aPriority - bPriority;
        });

      // Create a node item for each node and insert after the location item
      onlineNodes.forEach((node, i) => {
        const nodeItem = new MullvadNodeItem(
          node.name,
          node.id,
          node.location?.Priority || 0,
          node.id === this._tailscale.exit_node
        );

        // Connect activation handler
        nodeItem.connect('activate', () => {
          this._onNodeItemClicked(nodeItem);
        });

        // Make the item activatable
        nodeItem._activatable = true;

        // Insert after the location item and any previously added node items
        this._listBox.insert_child_at_index(nodeItem, locationIndex + 1 + i);
      });
    }

    /**
     * Handle node item click event
     *
     * @param {MullvadNodeItem} nodeItem - The clicked node item
     * @private
     */
    _onNodeItemClicked(nodeItem) {
      // Deselect previous item if any
      if (this._selectedItem) {
        this._selectedItem.selected = false;
      }

      // Select the clicked item
      nodeItem.selected = true;
      this._selectedItem = nodeItem;

      // Connect to the selected node and close the dialog
      this._tailscale.exit_node = nodeItem.nodeId;
      this.close();
    }

    /**
     * Handle location item click event
     *
     * @param {MullvadLocationItem} locationItem - The clicked location item
     * @private
     */
    _onLocationItemClicked(locationItem) {
      // Deselect previous item if any
      if (this._selectedItem && this._selectedItem !== locationItem) {
        this._selectedItem.selected = false;
      }

      // Select the clicked item
      locationItem.selected = true;
      this._selectedItem = locationItem;

      // Connect to the selected node and close the dialog
      if (this._selectedItem?.bestNode) {
        this._tailscale.exit_node = this._selectedItem.bestNode.id;
        this.close();
      }
    }

    /**
     * Handle search query changed event
     * @private
     */
    _onSearchQueryChanged() {
      this._searchQuery = this._searchEntry.get_text() || '';
      this._populateLocationsList();
    }

    /**
     * Handle cancel button click event
     * @private
     */
    _onCancelClicked() {
      this.close();
    }
  }
);

/**
 * Create a menu item for selecting Mullvad exit nodes
 *
 * @param {Array} availableMullvadNodes - Array of available Mullvad nodes
 * @param {Object} tailscale - Tailscale instance to control exit node selection
 * @returns {PopupMenu.PopupMenuItem|null} The menu item or null if no nodes available
 */
export function createMullvadExitNodeButton(availableMullvadNodes, tailscale) {
  if (!availableMullvadNodes || availableMullvadNodes.length === 0) {
    return null;
  }

  const mullvadButtonItem = new PopupMenu.PopupMenuItem(_("Mullvad Exit Nodes"));
  mullvadButtonItem.connect('activate', () => {
    const dialog = new MullvadExitNodeDialog(availableMullvadNodes, tailscale);
    dialog.open();
  });

  return mullvadButtonItem;
}

/**
 * Filter Mullvad nodes from all available nodes
 *
 * @param {Array} nodes - Array of all available nodes
 * @returns {Array} Filtered array containing only Mullvad nodes
 */
export function filterMullvadNodes(nodes) {
  if (!nodes || !Array.isArray(nodes)) {
    return [];
  }

  return nodes.filter(node =>
    node.mullvad === true &&
    node.online === true
  );
}
