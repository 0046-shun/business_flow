// Business Flow Creator - Main JavaScript File

class FlowCreator {
    constructor() {
        this.canvas = document.getElementById('flowCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.elements = [];
        this.connections = [];
        this.selectedElement = null;
        this.selectedElements = []; // 複数選択された要素
        this.selectedTool = 'card';
        this.selectedTemplate = 'basic';
        this.selectedColor = '#007bff';
        this.isDragging = false;
        this.isResizing = false;
        this.dragOffset = { x: 0, y: 0 };
        this.resizeHandle = null;
        this.resizeStartSize = { width: 0, height: 0 };
        this.resizeStartPos = { x: 0, y: 0 };
        this.gridSize = 20;
        this.showGrid = true;
        this.snapToGrid = true;
        this.elementIdCounter = 0;
        this.saveTimeout = null;
        this.lastSaveTime = 0;
        this.zoomLevel = 1;
        this.canvasWidth = 800;
        this.canvasHeight = 600;
        this.flowTitle = '';
        this.isEditingText = false;
        this.textEditElement = null;
        this.highlightedElement = null;
        this.justCreatedElement = false;
        this.editMode = false;
        this.history = [];
        this.historyIndex = -1;
        this.isUndoing = false;
        this.isCreatingArrow = false;
        this.currentArrow = null;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupCanvas();
        this.drawGrid();
        this.loadFromStorage();
        
        // Set default selection
        document.querySelector('.template-btn[data-type="card"][data-template="basic"]').classList.add('active');
        
        // Flow title event listener
        document.getElementById('flowTitle').addEventListener('input', (e) => {
            this.flowTitle = e.target.value;
            this.debouncedSave();
        });
        
        // Canvas controls
        document.getElementById('zoomIn').addEventListener('click', () => this.zoomIn());
        document.getElementById('zoomOut').addEventListener('click', () => this.zoomOut());
        document.getElementById('zoomReset').addEventListener('click', () => this.zoomReset());
        document.getElementById('expandCanvas').addEventListener('click', () => this.expandCanvas());
    }

    setupEventListeners() {
        // Template selection
        document.querySelectorAll('.template-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const type = e.target.dataset.type;
                const template = e.target.dataset.template;
                this.selectTemplate(type, template);
            });
        });


        // Canvas events
        // this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.canvas.addEventListener('dblclick', (e) => this.handleDoubleClick(e));
        this.canvas.addEventListener('contextmenu', (e) => this.handleContextMenu(e));

        // Grid toggle
        document.getElementById('gridToggle').addEventListener('change', (e) => {
            this.showGrid = e.target.checked;
            this.redraw();
        });

        document.getElementById('snapToggle').addEventListener('change', (e) => {
            this.snapToGrid = e.target.checked;
        });

        // Edit mode toggle
        document.getElementById('editModeToggle').addEventListener('change', (e) => {
            this.editMode = e.target.checked;
            this.updateEditModeUI();
        });

        // File operations
        document.getElementById('undoBtn').addEventListener('click', () => this.undo());
        document.getElementById('exportPngBtn').addEventListener('click', () => this.exportCanvasAsPng());
        document.getElementById('clearBtn').addEventListener('click', () => this.clearCanvas());

        // Property panel events
        document.getElementById('elementText').addEventListener('input', (e) => this.updateElementText(e.target.value));
        document.getElementById('elementColor').addEventListener('change', (e) => this.updateElementColor(e.target.value));
        document.getElementById('elementWidth').addEventListener('input', (e) => this.updateElementSize('width', parseInt(e.target.value)));
        document.getElementById('elementHeight').addEventListener('input', (e) => this.updateElementSize('height', parseInt(e.target.value)));
        document.getElementById('arrowThickness').addEventListener('input', (e) => this.updateArrowThickness(parseInt(e.target.value)));
        document.getElementById('arrowStartHead').addEventListener('change', (e) => this.updateArrowHead('start', e.target.value));
        document.getElementById('arrowEndHead').addEventListener('change', (e) => this.updateArrowHead('end', e.target.value));
        document.getElementById('deleteElement').addEventListener('click', () => this.deleteSelectedElement());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
    }

    setupCanvas() {
        // Set canvas size
        this.canvas.width = this.canvasWidth;
        this.canvas.height = this.canvasHeight;
        
        // Set canvas style
        this.canvas.style.cursor = 'crosshair';
    }

    selectTemplate(type, template) {
        this.selectedTool = type;
        this.selectedTemplate = template;
        
        // Update active button
        document.querySelectorAll('.template-btn').forEach(btn => btn.classList.remove('active'));
        event.target.classList.add('active');
        
        this.canvas.style.cursor = 'crosshair';
    }

    handleCanvasClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Snap to grid if enabled
        // For arrows, use 0.5 grid offset to center them properly
        let snappedX, snappedY;
        if (this.selectedTool === 'arrow') {
            snappedX = this.snapToGrid ? Math.round(x / this.gridSize) * this.gridSize + this.gridSize / 2 : x;
            snappedY = this.snapToGrid ? Math.round(y / this.gridSize) * this.gridSize + this.gridSize / 2 : y;
        } else {
            snappedX = this.snapToGrid ? Math.round(x / this.gridSize) * this.gridSize : x;
            snappedY = this.snapToGrid ? Math.round(y / this.gridSize) * this.gridSize : y;
        }

        // Check if clicking on existing element
        const clickedElement = this.getElementAt(snappedX, snappedY);
        if (clickedElement) {
            this.selectElement(clickedElement);
            return;
        }

        // Create new element
        this.createElement(this.selectedTool, this.selectedTemplate, snappedX, snappedY);
    }

    createElement(type, template, x, y) {
        const templateConfig = this.getTemplateConfig(type, template);
        
        const element = {
            id: ++this.elementIdCounter,
            type: type,
            template: template,
            x: x,
            y: y,
            width: templateConfig.width,
            height: templateConfig.height,
            text: templateConfig.defaultText,
            color: templateConfig.color,
            thickness: templateConfig.thickness || (type === 'arrow' ? 8 : 2),
            style: templateConfig.style || {}
        };

        if (type === 'arrow') {
            const defaultEnd = this.getSnappedPoint(x + templateConfig.width, y, true);
            element.startX = x;
            element.startY = y;
            element.endX = defaultEnd.x;
            element.endY = defaultEnd.y;
            element.startHead = 'none';
            element.endHead = 'arrow';
            this.updateArrowBounds(element);
        }

        this.elements.push(element);
        this.selectElement(element);
        this.justCreatedElement = true;
        this.redraw();
        this.debouncedSave();
    }

    getTemplateConfig(type, template) {
        const configs = {
            card: {
                basic: { width: 140, height: 70, defaultText: 'カード', color: '#007bff' }
            },
            textbox: {
                plain: { width: 160, height: 50, defaultText: 'テキスト', color: '#212529' }
            },
            branch: {
                diamond: { width: 100, height: 80, defaultText: '分岐', color: '#ffc107' }
            },
            actor: {
                human: { width: 120, height: 140, defaultText: 'アクター', color: '#0d6efd' }
            },
            arrow: {
                line: { width: 120, height: 60, defaultText: '', color: '#6c757d', thickness: 4 }
            }
        };

        return configs[type]?.[template] || configs[type]?.basic || configs['card'].basic;
    }

    getElementAt(x, y) {
        for (let i = this.elements.length - 1; i >= 0; i--) {
            const element = this.elements[i];
            
            if (element.type === 'arrow') {
                // For arrows, check if click is on the actual arrow line/head
                if (this.isPointOnArrow(element, x, y)) {
                    return element;
                }
            } else {
                // For other elements, use rectangular bounds
                if (x >= element.x && x <= element.x + element.width &&
                    y >= element.y && y <= element.y + element.height) {
                    return element;
                }
            }
        }
        return null;
    }

    isPointOnArrow(element, x, y) {
        const { startX, startY, endX, endY } = this.getArrowEndpoints(element);
        const thickness = element.thickness || 8;
        const tolerance = Math.max(thickness / 2 + 6, 10);
        const dist = this.distancePointToSegment(x, y, startX, startY, endX, endY);
        return dist <= tolerance;
    }

    isPointInTriangle(px, py, x1, y1, x2, y2, x3, y3) {
        const denom = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3);
        const a = ((y2 - y3) * (px - x3) + (x3 - x2) * (py - y3)) / denom;
        const b = ((y3 - y1) * (px - x3) + (x1 - x3) * (py - y3)) / denom;
        const c = 1 - a - b;
        return a >= 0 && b >= 0 && c >= 0;
    }

    selectElement(element) {
        // Deselect all elements first
        this.elements.forEach(el => el.selected = false);
        
        // Select the clicked element
        element.selected = true;
        this.selectedElement = element;
        this.selectedElements = [element];
        
        this.updatePropertyPanel();
        this.redraw();
    }

    toggleElementSelection(element) {
        if (this.selectedElements.includes(element)) {
            // Remove from selection
            element.selected = false;
            this.selectedElements = this.selectedElements.filter(el => el !== element);
            
            // Update primary selection
            if (this.selectedElement === element) {
                this.selectedElement = this.selectedElements.length > 0 ? this.selectedElements[0] : null;
            }
        } else {
            // Add to selection
            element.selected = true;
            this.selectedElements.push(element);
            
            // Set as primary selection if it's the first one
            if (this.selectedElements.length === 1) {
                this.selectedElement = element;
            }
        }
        
        this.updatePropertyPanel();
        this.redraw();
    }

    clearMultiSelection() {
        this.elements.forEach(el => el.selected = false);
        this.selectedElement = null;
        this.selectedElements = [];
        this.updatePropertyPanel();
        this.redraw();
    }

    updatePropertyPanel() {
        const propertiesPanel = document.getElementById('elementProperties');
        const noSelection = document.getElementById('noSelection');
        const arrowThicknessContainer = document.getElementById('arrowThicknessContainer');
        const arrowHeadContainer = document.getElementById('arrowHeadContainer');

        if (this.selectedElement) {
            propertiesPanel.classList.remove('d-none');
            noSelection.classList.add('d-none');

            // Show multi-selection info
            if (this.selectedElements.length > 1) {
                const multiSelectInfo = document.createElement('div');
                multiSelectInfo.className = 'alert alert-info mb-3';
                multiSelectInfo.innerHTML = `<small><i class="fas fa-info-circle"></i> ${this.selectedElements.length}個のアイテムが選択されています。プロパティの変更はすべてのアイテムに適用されます。</small>`;
                
                // Remove existing multi-select info if any
                const existingInfo = propertiesPanel.querySelector('.alert-info');
                if (existingInfo) {
                    existingInfo.remove();
                }
                
                propertiesPanel.insertBefore(multiSelectInfo, propertiesPanel.firstChild);
            } else {
                // Remove multi-select info for single selection
                const existingInfo = propertiesPanel.querySelector('.alert-info');
                if (existingInfo) {
                    existingInfo.remove();
                }
            }

            // Show properties for multi-selection
            if (this.selectedElements.length > 1) {
                // For multi-selection, show properties of the main selected element
                // but indicate that changes will apply to all selected elements
                document.getElementById('elementText').value = this.selectedElement.text;
                document.getElementById('elementColor').value = this.selectedElement.color;
                document.getElementById('elementWidth').value = this.selectedElement.width;
                document.getElementById('elementHeight').value = this.selectedElement.height;
            } else {
                // Single selection - show normal properties
                document.getElementById('elementText').value = this.selectedElement.text;
                document.getElementById('elementColor').value = this.selectedElement.color;
                document.getElementById('elementWidth').value = this.selectedElement.width;
                document.getElementById('elementHeight').value = this.selectedElement.height;
            }

            // Show/hide arrow thickness control
            if (this.selectedElement.type === 'arrow') {
                arrowThicknessContainer.style.display = 'block';
                arrowHeadContainer.style.display = 'block';
                document.getElementById('arrowThickness').value = this.selectedElement.thickness || 4;
                document.getElementById('thicknessValue').textContent = this.selectedElement.thickness || 4;
                document.getElementById('arrowStartHead').value = this.selectedElement.startHead || 'none';
                document.getElementById('arrowEndHead').value = this.selectedElement.endHead || 'arrow';
            } else {
                arrowThicknessContainer.style.display = 'none';
                arrowHeadContainer.style.display = 'none';
            }
        } else {
            propertiesPanel.classList.add('d-none');
            noSelection.classList.remove('d-none');
            arrowThicknessContainer.style.display = 'none';
            arrowHeadContainer.style.display = 'none';
        }
    }

    updateEditModeUI() {
        const templateButtons = document.querySelectorAll('.template-btn');
        const canvas = this.canvas;
        
        if (this.editMode) {
            // 編集モード時：テンプレートボタンを無効化
            templateButtons.forEach(btn => {
                btn.disabled = true;
                btn.classList.add('disabled');
            });
            canvas.style.cursor = 'default';
            canvas.title = '編集モード：新しいアイテムの追加は無効です';
        } else {
            // 通常モード時：テンプレートボタンを有効化
            templateButtons.forEach(btn => {
                btn.disabled = false;
                btn.classList.remove('disabled');
            });
            canvas.style.cursor = 'crosshair';
            canvas.title = '';
        }
    }

    updateElementText(text) {
        if (this.selectedElement) {
            // Apply text change to all selected elements
            this.pushHistory();
            this.selectedElements.forEach(element => {
                element.text = text;
            });
            this.redraw();
            this.debouncedSave();
        }
    }

    updateElementColor(color) {
        if (this.selectedElement) {
            // Apply color change to all selected elements
            this.pushHistory();
            this.selectedElements.forEach(element => {
                element.color = color;
            });
            this.redraw();
            this.debouncedSave();
        }
    }

    updateElementSize(dimension, value) {
        if (this.selectedElement && value > 0) {
            // Apply size change to all selected elements (except arrows)
            this.pushHistory();
            this.selectedElements.forEach(element => {
                if (element.type !== 'arrow') {
                    element[dimension] = value;
                }
            });
            this.redraw();
            this.debouncedSave();
        }
    }

    updateArrowThickness(thickness) {
        if (this.selectedElement && this.selectedElement.type === 'arrow') {
            // Apply thickness change to all selected arrow elements
            this.pushHistory();
            this.selectedElements.forEach(element => {
                if (element.type === 'arrow') {
                    element.thickness = thickness;
                }
            });
            document.getElementById('thicknessValue').textContent = thickness;
            this.redraw();
            this.debouncedSave();
        }
    }

    updateArrowHead(position, value) {
        if (this.selectedElement && this.selectedElement.type === 'arrow') {
            this.pushHistory();
            this.selectedElements.forEach(element => {
                if (element.type === 'arrow') {
                    if (position === 'start') {
                        element.startHead = value;
                    } else {
                        element.endHead = value;
                    }
                }
            });
            this.redraw();
            this.debouncedSave();
        }
    }

    deleteSelectedElement() {
        if (this.selectedElement) {
            // Delete all selected elements
            this.pushHistory();
            this.selectedElements.forEach(element => {
                const index = this.elements.indexOf(element);
                if (index > -1) {
                    this.elements.splice(index, 1);
                }
            });
            
            this.clearMultiSelection();
            this.redraw();
            this.debouncedSave();
        }
    }

    handleMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (this.selectedTool === 'arrow' && this.isCreatingArrow && this.currentArrow) {
            const endPoint = this.getSnappedPoint(x, y, true);
            this.currentArrow.endX = endPoint.x;
            this.currentArrow.endY = endPoint.y;
            this.updateArrowBounds(this.currentArrow);
            this.isCreatingArrow = false;
            this.currentArrow = null;
            this.canvas.style.cursor = 'crosshair';
            this.debouncedSave();
            return;
        }

        // Check for resize handle first
        if (this.selectedElement) {
            const handle = this.getResizeHandleAt(x, y);
            if (handle) {
                this.isResizing = true;
                this.resizeHandle = handle;
                this.resizeStartSize = { width: this.selectedElement.width, height: this.selectedElement.height };
                this.resizeStartPos = { x, y };
                this.canvas.style.cursor = 'nw-resize';
                this.pushHistory();
                return;
            }
        }

        const element = this.getElementAt(x, y);
        if (element) {
            // Check for Shift+Click for multi-selection
            if (e.shiftKey) {
                this.toggleElementSelection(element);
                // Don't start dragging immediately for multi-selection
                // User can drag after selection is complete
            } else {
                // Check if this element is part of multi-selection
                if (this.selectedElements.length > 1 && this.selectedElements.includes(element)) {
                    // Start dragging multi-selected elements
                    this.pushHistory();
                    this.isDragging = true;
                    this.dragOffset.x = x - element.x;
                    this.dragOffset.y = y - element.y;
                    this.canvas.style.cursor = 'grabbing';
                } else {
                    // Single selection
                    this.clearMultiSelection();
                    this.pushHistory();
                    this.isDragging = true;
                    this.dragOffset.x = x - element.x;
                    this.dragOffset.y = y - element.y;
                    this.selectElement(element);
                    this.canvas.style.cursor = 'grabbing';
                }
            }
        } else if (!e.shiftKey) {
            // Click on empty space without Shift - clear all selections and create new element
            this.clearMultiSelection();
            
            // Check if edit mode is enabled
            if (this.editMode) {
                // In edit mode, don't create new elements
                return;
            }
            
            // Create new element at clicked position
            const startPoint = this.getSnappedPoint(x, y, this.selectedTool === 'arrow');
            this.pushHistory();
            if (this.selectedTool === 'arrow') {
                const templateConfig = this.getTemplateConfig('arrow', this.selectedTemplate);
                const element = {
                    id: ++this.elementIdCounter,
                    type: 'arrow',
                    template: this.selectedTemplate,
                    x: startPoint.x,
                    y: startPoint.y,
                    width: templateConfig.width,
                    height: templateConfig.height,
                    text: '',
                    color: templateConfig.color,
                    thickness: templateConfig.thickness || 8,
                    style: templateConfig.style || {},
                    startX: startPoint.x,
                    startY: startPoint.y,
                    endX: startPoint.x,
                    endY: startPoint.y,
                    startHead: 'none',
                    endHead: 'arrow'
                };
                this.elements.push(element);
                this.selectElement(element);
                this.isCreatingArrow = true;
                this.currentArrow = element;
                this.redraw();
            } else {
                this.createElement(this.selectedTool, this.selectedTemplate, startPoint.x, startPoint.y);
            }
        }
    }

    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (this.isCreatingArrow && this.currentArrow) {
            const endPoint = this.getSnappedPoint(x, y, true);
            this.currentArrow.endX = endPoint.x;
            this.currentArrow.endY = endPoint.y;
            this.updateArrowBounds(this.currentArrow);
            this.redraw();
        } else if (this.isResizing && this.selectedElement) {
            const deltaX = x - this.resizeStartPos.x;
            const deltaY = y - this.resizeStartPos.y;

            if (this.selectedElement.type === 'arrow') {
                const movePoint = this.getSnappedPoint(x, y, true);
                if (this.resizeHandle === 'start') {
                    this.selectedElement.startX = movePoint.x;
                    this.selectedElement.startY = movePoint.y;
                } else if (this.resizeHandle === 'end') {
                    this.selectedElement.endX = movePoint.x;
                    this.selectedElement.endY = movePoint.y;
                }
                this.updateArrowBounds(this.selectedElement);
            } else {
                // 通常の要素のリサイズ
                let newWidth = this.resizeStartSize.width;
                let newHeight = this.resizeStartSize.height;

                // Calculate new size based on resize handle
                switch (this.resizeHandle) {
                    case 'se': // Southeast (bottom-right)
                        newWidth = Math.max(50, this.resizeStartSize.width + deltaX);
                        newHeight = Math.max(30, this.resizeStartSize.height + deltaY);
                        break;
                    case 'sw': // Southwest (bottom-left)
                        newWidth = Math.max(50, this.resizeStartSize.width - deltaX);
                        newHeight = Math.max(30, this.resizeStartSize.height + deltaY);
                        break;
                    case 'ne': // Northeast (top-right)
                        newWidth = Math.max(50, this.resizeStartSize.width + deltaX);
                        newHeight = Math.max(30, this.resizeStartSize.height - deltaY);
                        break;
                    case 'nw': // Northwest (top-left)
                        newWidth = Math.max(50, this.resizeStartSize.width - deltaX);
                        newHeight = Math.max(30, this.resizeStartSize.height - deltaY);
                        break;
                }

                // Snap to grid if enabled
                if (this.snapToGrid) {
                    newWidth = Math.round(newWidth / this.gridSize) * this.gridSize;
                    newHeight = Math.round(newHeight / this.gridSize) * this.gridSize;
                }

                // Apply size changes to all selected elements
                this.selectedElements.forEach(element => {
                    if (element.type !== 'arrow') {
                        element.width = newWidth;
                        element.height = newHeight;
                    }
                });
            }

            // Update property panel
            document.getElementById('elementWidth').value = this.selectedElement.width;
            document.getElementById('elementHeight').value = this.selectedElement.height;

            this.redraw();
        } else if (this.isDragging && this.selectedElement) {
            let newX = x - this.dragOffset.x;
            let newY = y - this.dragOffset.y;

            // Snap to grid if enabled (but allow fine adjustment for arrows with Ctrl key)
            if (this.snapToGrid && !(this.selectedElement.type === 'arrow' && e.ctrlKey)) {
                // For arrows, use 0.5 grid offset to center them properly
                if (this.selectedElement.type === 'arrow') {
                    newX = Math.round(newX / this.gridSize) * this.gridSize + this.gridSize / 2;
                    newY = Math.round(newY / this.gridSize) * this.gridSize + this.gridSize / 2;
                } else {
                    newX = Math.round(newX / this.gridSize) * this.gridSize;
                    newY = Math.round(newY / this.gridSize) * this.gridSize;
                }
            }

            // Calculate the movement delta
            const deltaX = newX - this.selectedElement.x;
            const deltaY = newY - this.selectedElement.y;

            // Move all selected elements
            this.selectedElements.forEach(element => {
                if (element.type === 'arrow' && element.startX !== undefined) {
                    element.startX += deltaX;
                    element.startY += deltaY;
                    element.endX += deltaX;
                    element.endY += deltaY;
                    this.updateArrowBounds(element);
                } else {
                    element.x = Math.max(0, Math.min(element.x + deltaX, this.canvas.width - element.width));
                    element.y = Math.max(0, Math.min(element.y + deltaY, this.canvas.height - element.height));
                }
            });

            this.redraw();
        } else {
            // Update cursor based on what's under the mouse
            this.updateCursor(x, y);
        }
    }

    handleMouseUp(e) {
        if (this.isDragging) {
            this.isDragging = false;
            this.canvas.style.cursor = 'crosshair';
            this.debouncedSave();
        } else if (this.isResizing) {
            this.isResizing = false;
            this.resizeHandle = null;
            this.canvas.style.cursor = 'crosshair';
            this.debouncedSave();
        }
        
        // If we just created an element, deselect it after a short delay
        if (this.justCreatedElement) {
            setTimeout(() => {
                this.clearMultiSelection();
                this.justCreatedElement = false;
            }, 100);
        }
    }

    handleKeyDown(e) {
        if (e.key === 'Delete' && this.selectedElement) {
            this.deleteSelectedElement();
        }
    }

    drawGrid() {
        if (!this.showGrid) return;

        this.ctx.strokeStyle = '#e9ecef';
        this.ctx.lineWidth = 1;

        // Draw vertical lines
        for (let x = 0; x <= this.canvas.width; x += this.gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
        }

        // Draw horizontal lines
        for (let y = 0; y <= this.canvas.height; y += this.gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
            this.ctx.stroke();
        }
    }

    drawElement(element) {
        this.ctx.save();

        // ハイライト表示
        if (this.highlightedElement === element) {
            this.ctx.shadowColor = '#007bff';
            this.ctx.shadowBlur = 10;
            this.ctx.shadowOffsetX = 0;
            this.ctx.shadowOffsetY = 0;
        }

        // Set color
        this.ctx.fillStyle = element.color;
        this.ctx.strokeStyle = element.selected ? '#0d6efd' : this.darkenColor(element.color, 0.2);
        
        // For multi-selected elements, use a different stroke color
        if (this.selectedElements.includes(element) && element !== this.selectedElement) {
            this.ctx.strokeStyle = '#6c757d'; // Gray for multi-selected but not primary
        }
        
        // Set line width based on element type
        if (element.type === 'arrow') {
            this.ctx.lineWidth = element.thickness || 8;
        } else {
            this.ctx.lineWidth = element.selected ? 3 : 2;
        }

        switch (element.type) {
            case 'card':
                this.drawCard(element);
                break;
            case 'textbox':
                this.drawTextBox(element);
                break;
            case 'arrow':
                this.drawArrow(element);
                break;
            case 'branch':
                this.drawBranch(element);
                break;
            case 'actor':
                this.drawActor(element);
                break;
            case 'function':
                this.drawFunction(element);
                break;
        }

        // Draw text
        if (element.text && element.type !== 'actor') {
            const isFunction = element.type === 'function';
            const isTextBox = element.type === 'textbox';
            this.ctx.fillStyle = isFunction ? '#fff' : (isTextBox ? element.color : '#000');
            this.ctx.font = isFunction ? 'bold 14px Segoe UI, sans-serif' : '14px Segoe UI, sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            
            // For function cards, position text to the right of the icon
            if (element.type === 'function') {
                const iconSize = 24;
                const iconX = element.x + 10;
                const textX = iconX + iconSize + 15; // Position text after icon with spacing
                const textY = element.y + element.height / 2; // Center vertically with icon
                
                // Change text alignment to left for function cards
                this.ctx.textAlign = 'left';
                this.ctx.fillText(element.text, textX, textY);
                this.ctx.textAlign = 'center'; // Reset for other elements
            } else {
                this.ctx.fillText(
                    element.text,
                    element.x + element.width / 2,
                    element.y + element.height / 2
                );
            }
        }

        this.ctx.restore();

        // Draw resize handles for main selected element or if element is part of multi-selection
        if (element === this.selectedElement || (this.selectedElements.length > 1 && this.selectedElements.includes(element))) {
            this.drawResizeHandles(element);
        }
    }

    drawResizeHandles(element) {
        if (element.type === 'arrow') {
            // For arrows, draw handles at arrow endpoints
            this.drawArrowResizeHandles(element);
        } else {
            // For other elements, use rectangular handles
            const handleSize = 8;
            const handles = [
                { x: element.x + element.width - handleSize/2, y: element.y + element.height - handleSize/2, type: 'se' }, // Southeast
                { x: element.x - handleSize/2, y: element.y + element.height - handleSize/2, type: 'sw' }, // Southwest
                { x: element.x + element.width - handleSize/2, y: element.y - handleSize/2, type: 'ne' }, // Northeast
                { x: element.x - handleSize/2, y: element.y - handleSize/2, type: 'nw' } // Northwest
            ];

            this.ctx.save();
            this.ctx.fillStyle = '#0d6efd';
            this.ctx.strokeStyle = '#fff';
            this.ctx.lineWidth = 2;

            handles.forEach(handle => {
                this.ctx.beginPath();
                this.ctx.rect(handle.x, handle.y, handleSize, handleSize);
                this.ctx.fill();
                this.ctx.stroke();
            });

            this.ctx.restore();
        }
    }

    drawArrowResizeHandles(element) {
        const { startX, startY, endX, endY } = this.getArrowEndpoints(element);

        this.ctx.save();
        this.ctx.fillStyle = '#0d6efd';
        this.ctx.strokeStyle = '#fff';
        this.ctx.lineWidth = 2;

        // Draw handles at arrow endpoints
        this.drawHandle(startX, startY);
        this.drawHandle(endX, endY);

        this.ctx.restore();
    }

    drawHandle(x, y) {
        this.ctx.beginPath();
        this.ctx.arc(x, y, 6, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();
    }

    getSnappedPoint(x, y, isArrow = false) {
        if (!this.snapToGrid) {
            return { x, y };
        }
        if (isArrow) {
            return {
                x: Math.round(x / this.gridSize) * this.gridSize + this.gridSize / 2,
                y: Math.round(y / this.gridSize) * this.gridSize + this.gridSize / 2
            };
        }
        return {
            x: Math.round(x / this.gridSize) * this.gridSize,
            y: Math.round(y / this.gridSize) * this.gridSize
        };
    }

    getArrowEndpoints(element) {
        if (element.startX !== undefined && element.endX !== undefined) {
            return {
                startX: element.startX,
                startY: element.startY,
                endX: element.endX,
                endY: element.endY
            };
        }
        const centerX = element.x + element.width / 2;
        const centerY = element.y + element.height / 2;
        const arrowLength = Math.min(element.width, element.height) * 0.8;
        switch (element.template) {
            case 'right':
                return {
                    startX: centerX - arrowLength / 2,
                    startY: centerY,
                    endX: centerX + arrowLength / 2,
                    endY: centerY
                };
            case 'down':
                return {
                    startX: centerX,
                    startY: centerY - arrowLength / 2,
                    endX: centerX,
                    endY: centerY + arrowLength / 2
                };
            case 'left':
                return {
                    startX: centerX + arrowLength / 2,
                    startY: centerY,
                    endX: centerX - arrowLength / 2,
                    endY: centerY
                };
            case 'up':
                return {
                    startX: centerX,
                    startY: centerY + arrowLength / 2,
                    endX: centerX,
                    endY: centerY - arrowLength / 2
                };
            default:
                return {
                    startX: element.x,
                    startY: element.y,
                    endX: element.x + element.width,
                    endY: element.y
                };
        }
    }

    updateArrowBounds(element) {
        const { startX, startY, endX, endY } = this.getArrowEndpoints(element);
        const minX = Math.min(startX, endX);
        const minY = Math.min(startY, endY);
        const maxX = Math.max(startX, endX);
        const maxY = Math.max(startY, endY);
        element.x = minX;
        element.y = minY;
        element.width = Math.max(1, maxX - minX);
        element.height = Math.max(1, maxY - minY);
    }

    distancePointToSegment(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        if (dx === 0 && dy === 0) {
            return Math.hypot(px - x1, py - y1);
        }
        const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
        const projX = x1 + t * dx;
        const projY = y1 + t * dy;
        return Math.hypot(px - projX, py - projY);
    }

    getResizeHandleAt(x, y) {
        // Check resize handles for all selected elements
        for (const element of this.selectedElements) {
            if (element.type === 'arrow') {
                const handle = this.getArrowResizeHandleAt(x, y, element);
                if (handle) return handle;
            } else {
                const handleSize = 8;
                const handles = [
                    { x: element.x + element.width - handleSize/2, y: element.y + element.height - handleSize/2, type: 'se' },
                    { x: element.x - handleSize/2, y: element.y + element.height - handleSize/2, type: 'sw' },
                    { x: element.x + element.width - handleSize/2, y: element.y - handleSize/2, type: 'ne' },
                    { x: element.x - handleSize/2, y: element.y - handleSize/2, type: 'nw' }
                ];

                for (const handle of handles) {
                    if (x >= handle.x && x <= handle.x + handleSize &&
                        y >= handle.y && y <= handle.y + handleSize) {
                        return handle.type;
                    }
                }
            }
        }
        
        return null;
    }

    getArrowResizeHandleAt(x, y, element = null) {
        const targetElement = element || this.selectedElement;
        if (!targetElement) return null;
        const { startX, startY, endX, endY } = this.getArrowEndpoints(targetElement);
        const handleRadius = 6;
        
        if (this.isPointInCircle(x, y, startX, startY, handleRadius)) {
            return 'start';
        }
        if (this.isPointInCircle(x, y, endX, endY, handleRadius)) {
            return 'end';
        }

        return null;
    }

    isPointInCircle(px, py, cx, cy, radius) {
        const distance = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
        return distance <= radius;
    }

    updateCursor(x, y) {
        if (this.selectedElement) {
            const handle = this.getResizeHandleAt(x, y);
            if (handle) {
                this.canvas.style.cursor = 'nw-resize';
                return;
            }
        }

        const element = this.getElementAt(x, y);
        if (element) {
            // Check if element is part of multi-selection
            if (this.selectedElements.length > 1 && this.selectedElements.includes(element)) {
                this.canvas.style.cursor = 'move';
            } else {
                this.canvas.style.cursor = 'move';
            }
        } else {
            this.canvas.style.cursor = 'crosshair';
        }
    }

    drawCard(element) {
        const radius = 8;
        this.ctx.beginPath();
        this.ctx.roundRect(element.x, element.y, element.width, element.height, radius);
        this.ctx.fill();
        this.ctx.stroke();
    }

    drawTextBox(element) {
        this.ctx.save();
        this.ctx.strokeStyle = element.color;
        this.ctx.lineWidth = 1.5;
        this.ctx.setLineDash([]);
        this.ctx.beginPath();
        this.ctx.roundRect(element.x, element.y, element.width, element.height, 4);
        this.ctx.stroke();
        this.ctx.restore();
    }

    drawArrow(element) {
        const { startX, startY, endX, endY } = this.getArrowEndpoints(element);
        const thickness = element.thickness || 8;

        // Save current context state
        this.ctx.save();
        
        // Set arrow-specific line width
        this.ctx.lineWidth = thickness;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        this.ctx.beginPath();
        this.ctx.moveTo(startX, startY);
        this.ctx.lineTo(endX, endY);
        
        this.ctx.stroke();

        // Draw arrowhead with proper thickness
        const headLength = Math.max(20, thickness * 3);
        const headAngle = Math.PI / 6;
        
        this.ctx.beginPath();

        const angle = Math.atan2(endY - startY, endX - startX);
        if (element.endHead !== 'none') {
            this.ctx.moveTo(endX, endY);
            this.ctx.lineTo(
                endX - headLength * Math.cos(angle - headAngle),
                endY - headLength * Math.sin(angle - headAngle)
            );
            this.ctx.moveTo(endX, endY);
            this.ctx.lineTo(
                endX - headLength * Math.cos(angle + headAngle),
                endY - headLength * Math.sin(angle + headAngle)
            );
        }
        if (element.startHead !== 'none') {
            const startAngle = angle + Math.PI;
            this.ctx.moveTo(startX, startY);
            this.ctx.lineTo(
                startX - headLength * Math.cos(startAngle - headAngle),
                startY - headLength * Math.sin(startAngle - headAngle)
            );
            this.ctx.moveTo(startX, startY);
            this.ctx.lineTo(
                startX - headLength * Math.cos(startAngle + headAngle),
                startY - headLength * Math.sin(startAngle + headAngle)
            );
        }
        
        this.ctx.stroke();
        
        // Restore context state
        this.ctx.restore();
    }

    drawBranch(element) {
        const centerX = element.x + element.width / 2;
        const centerY = element.y + element.height / 2;
        const radius = Math.min(element.width, element.height) / 2 - 5;

        this.ctx.beginPath();
        
        // Draw branch based on template
        switch (element.template) {
            case 'triangle':
                this.ctx.moveTo(centerX, element.y);
                this.ctx.lineTo(element.x + element.width, element.y + element.height);
                this.ctx.lineTo(element.x, element.y + element.height);
                this.ctx.closePath();
                break;
            case 'diamond':
                // Draw diamond shape
                this.ctx.moveTo(centerX, centerY - radius);
                this.ctx.lineTo(centerX + radius, centerY);
                this.ctx.lineTo(centerX, centerY + radius);
                this.ctx.lineTo(centerX - radius, centerY);
                this.ctx.closePath();
                break;
            case 'circle':
                // Draw circle
                this.ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
                break;
            case 'hexagon':
                // Draw hexagon
                const hexRadius = radius;
                this.ctx.moveTo(centerX + hexRadius, centerY);
                for (let i = 1; i <= 6; i++) {
                    const angle = (i * Math.PI) / 3;
                    const x = centerX + hexRadius * Math.cos(angle);
                    const y = centerY + hexRadius * Math.sin(angle);
                    this.ctx.lineTo(x, y);
                }
                this.ctx.closePath();
                break;
        }
        
        this.ctx.fill();
        this.ctx.stroke();
    }

    drawActor(element) {
        const centerX = element.x + element.width / 2;
        const headRadius = 12;
        const boxHeight = 32;
        const boxY = element.y + element.height - boxHeight;
        const iconTop = element.y + 8;
        const bodyTop = iconTop + headRadius * 2 + 4;
        const bodyBottom = boxY - 6;
        const armSpan = 24;
        const legSpan = 18;

        this.ctx.save();
        this.ctx.strokeStyle = element.color;
        this.ctx.fillStyle = element.color;
        this.ctx.lineWidth = 2;

        // Head
        this.ctx.beginPath();
        this.ctx.arc(centerX, iconTop + headRadius, headRadius, 0, Math.PI * 2);
        this.ctx.fill();

        // Body
        this.ctx.beginPath();
        this.ctx.moveTo(centerX, bodyTop);
        this.ctx.lineTo(centerX, bodyBottom);
        this.ctx.stroke();

        // Arms
        this.ctx.beginPath();
        this.ctx.moveTo(centerX - armSpan, bodyTop + 10);
        this.ctx.lineTo(centerX + armSpan, bodyTop + 10);
        this.ctx.stroke();

        // Legs
        this.ctx.beginPath();
        this.ctx.moveTo(centerX, bodyBottom);
        this.ctx.lineTo(centerX - legSpan, bodyBottom + 18);
        this.ctx.moveTo(centerX, bodyBottom);
        this.ctx.lineTo(centerX + legSpan, bodyBottom + 18);
        this.ctx.stroke();

        // Text box for actor name
        this.ctx.fillStyle = '#ffffff';
        this.ctx.strokeStyle = element.color;
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        this.ctx.roundRect(element.x + 8, boxY, element.width - 16, boxHeight, 4);
        this.ctx.fill();
        this.ctx.stroke();

        if (element.text) {
            this.ctx.fillStyle = '#212529';
            this.ctx.font = '14px Segoe UI, sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(element.text, centerX, boxY + boxHeight / 2);
        }

        this.ctx.restore();
    }

    drawFunction(element) {
        const radius = 8;
        
        // Create gradient for 3D effect
        const gradient = this.ctx.createLinearGradient(
            element.x, 
            element.y, 
            element.x, 
            element.y + element.height
        );
        
        // Different gradients based on template
        const gradients = {
            database: ['#00d4ff', '#0096c7'],
            api: ['#4cc9f0', '#3a86ff'],
            email: ['#7209b7', '#560bad'],
            notification: ['#f72585', '#b5179e'],
            calculation: ['#ff9500', '#ff6d00'],
            validation: ['#06d6a0', '#118ab2']
        };
        
        const colors = gradients[element.template] || ['#17a2b8', '#138496'];
        gradient.addColorStop(0, colors[0]);
        gradient.addColorStop(1, colors[1]);
        
        // Draw shadow for depth
        this.ctx.save();
        this.ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        this.ctx.shadowBlur = 10;
        this.ctx.shadowOffsetX = 4;
        this.ctx.shadowOffsetY = 4;
        
        // Draw main shape with gradient
        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.roundRect(element.x, element.y, element.width, element.height, radius);
        this.ctx.fill();
        
        this.ctx.restore();
        
        // Draw border
        this.ctx.strokeStyle = element.selected ? '#0d6efd' : 'rgba(255, 255, 255, 0.5)';
        this.ctx.lineWidth = element.selected ? 3 : 2;
        this.ctx.stroke();
        
        // Draw icon background
        const iconSize = 24;
        const iconX = element.x + 10;
        const iconY = element.y + 10;
        
        this.ctx.save();
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        this.ctx.beginPath();
        this.ctx.arc(iconX + iconSize/2, iconY + iconSize/2, iconSize/2 + 4, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Draw icon symbol
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        this.ctx.font = 'bold 20px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        const icons = {
            database: '🗄',
            api: '☁',
            email: '✉',
            notification: '🔔',
            calculation: '🔢',
            validation: '✓'
        };
        
        this.ctx.fillText(icons[element.template] || '⚙', iconX + iconSize/2, iconY + iconSize/2);
        this.ctx.restore();
        
        // Draw glossy highlight
        const highlightGradient = this.ctx.createLinearGradient(
            element.x,
            element.y,
            element.x,
            element.y + element.height / 2
        );
        highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
        highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        
        this.ctx.fillStyle = highlightGradient;
        this.ctx.beginPath();
        this.ctx.roundRect(element.x, element.y, element.width, element.height / 2, [radius, radius, 0, 0]);
        this.ctx.fill();
    }

    redraw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawGrid();
        
        this.elements.forEach(element => {
            element.selected = element === this.selectedElement;
            this.drawElement(element);
        });
    }

    darkenColor(color, factor) {
        const hex = color.replace('#', '');
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);
        
        return `rgb(${Math.floor(r * (1 - factor))}, ${Math.floor(g * (1 - factor))}, ${Math.floor(b * (1 - factor))})`;
    }

    pushHistory() {
        if (this.isUndoing) return;
        const snapshot = {
            elements: JSON.parse(JSON.stringify(this.elements)),
            connections: JSON.parse(JSON.stringify(this.connections)),
            elementIdCounter: this.elementIdCounter,
            flowTitle: this.flowTitle,
            canvasWidth: this.canvasWidth,
            canvasHeight: this.canvasHeight,
            zoomLevel: this.zoomLevel
        };

        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }
        this.history.push(snapshot);
        if (this.history.length > 50) {
            this.history.shift();
        }
        this.historyIndex = this.history.length - 1;
    }

    undo() {
        if (this.historyIndex < 0) {
            return;
        }
        this.isUndoing = true;
        const snapshot = this.history[this.historyIndex];
        this.historyIndex -= 1;

        this.elements = JSON.parse(JSON.stringify(snapshot.elements));
        this.connections = JSON.parse(JSON.stringify(snapshot.connections));
        this.elementIdCounter = snapshot.elementIdCounter;
        this.flowTitle = snapshot.flowTitle;
        this.canvasWidth = snapshot.canvasWidth;
        this.canvasHeight = snapshot.canvasHeight;
        this.zoomLevel = snapshot.zoomLevel;
        document.getElementById('flowTitle').value = this.flowTitle;

        this.setupCanvas();
        this.clearMultiSelection();
        this.redraw();
        this.debouncedSave();
        this.isUndoing = false;
    }

    saveToStorage(showNotification = false) {
        const flowData = {
            elements: this.elements,
            connections: this.connections,
            elementIdCounter: this.elementIdCounter,
            flowTitle: this.flowTitle,
            canvasWidth: this.canvasWidth,
            canvasHeight: this.canvasHeight,
            zoomLevel: this.zoomLevel,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        localStorage.setItem('businessFlow', JSON.stringify(flowData));
        
        if (showNotification) {
            this.showNotification('フローが保存されました', 'success');
        }
    }

    debouncedSave() {
        // Clear existing timeout
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        
        // Set new timeout for 1 second
        this.saveTimeout = setTimeout(() => {
            this.saveToStorage(false);
        }, 1000);
    }

    loadFromStorage() {
        const savedData = localStorage.getItem('businessFlow');
        if (savedData) {
            try {
                const flowData = JSON.parse(savedData);
                this.elements = flowData.elements || [];
                this.connections = flowData.connections || [];
                this.elementIdCounter = flowData.elementIdCounter || 0;
                this.flowTitle = flowData.flowTitle || '';
                this.canvasWidth = flowData.canvasWidth || 800;
                this.canvasHeight = flowData.canvasHeight || 600;
                this.zoomLevel = flowData.zoomLevel || 1;
                
                // Update UI
                document.getElementById('flowTitle').value = this.flowTitle;
                this.setupCanvas();
                this.redraw();
                this.showNotification('フローが読み込まれました', 'info');
            } catch (error) {
                console.error('Error loading flow data:', error);
                this.showNotification('フローの読み込みに失敗しました', 'error');
            }
        }
    }

    exportFlow() {
        const flowData = {
            elements: this.elements,
            connections: this.connections,
            flowTitle: this.flowTitle,
            canvasWidth: this.canvasWidth,
            canvasHeight: this.canvasHeight,
            zoomLevel: this.zoomLevel,
            metadata: {
                exportedAt: new Date().toISOString(),
                version: '1.0'
            }
        };

        const dataStr = JSON.stringify(flowData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `business-flow-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        
        this.showNotification('フローがエクスポートされました', 'success');
    }

    exportCanvasAsPng() {
        if (!this.flowTitle || this.flowTitle.trim().length === 0) {
            alert('フロータイトルを入力してください');
            return;
        }
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = this.canvas.width;
        exportCanvas.height = this.canvas.height;
        const exportCtx = exportCanvas.getContext('2d');
        
        // Use a white background for readability
        exportCtx.fillStyle = '#ffffff';
        exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
        exportCtx.drawImage(this.canvas, 0, 0);
        
        const dataUrl = exportCanvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = dataUrl;
        const safeTitle = (this.flowTitle || '').trim().replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '-');
        const baseName = safeTitle.length > 0 ? safeTitle : 'business-flow';
        link.download = `${baseName}-${new Date().toISOString().split('T')[0]}.png`;
        link.click();
        
        this.showNotification('キャンバスをPNGで保存しました', 'success');
    }

    clearCanvas() {
        if (confirm('すべての要素を削除しますか？')) {
            this.pushHistory();
            this.elements = [];
            this.connections = [];
            this.selectedElement = null;
            this.elementIdCounter = 0;
            this.flowTitle = '';
            document.getElementById('flowTitle').value = '';
            this.updatePropertyPanel();
            this.redraw();
            this.saveToStorage(true);
            this.showNotification('キャンバスがクリアされました', 'info');
        }
    }

    // Zoom functions
    zoomIn() {
        this.zoomLevel = Math.min(this.zoomLevel * 1.2, 3);
        this.applyZoom();
    }

    zoomOut() {
        this.zoomLevel = Math.max(this.zoomLevel / 1.2, 0.3);
        this.applyZoom();
    }

    zoomReset() {
        this.zoomLevel = 1;
        this.applyZoom();
    }

    applyZoom() {
        this.canvas.style.transform = `scale(${this.zoomLevel})`;
        this.canvas.style.transformOrigin = 'top left';
    }

    expandCanvas() {
        this.canvasWidth += 200;
        this.canvasHeight += 200;
        this.setupCanvas();
        this.redraw();
        this.debouncedSave();
    }

    // Text editing functions
    handleDoubleClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const element = this.getElementAt(x, y);
        if (element) {
            this.startTextEdit(element, x, y);
        }
    }

    startTextEdit(element, x, y) {
        this.isEditingText = true;
        this.textEditElement = element;
        
        // アイテムをハイライト表示
        this.highlightedElement = element;
        this.redraw();

        // Create input overlay
        const input = document.createElement('input');
        input.className = 'text-edit-overlay';
        input.value = element.text;
        input.style.position = 'absolute';
        // アイテムの位置にテキストボックスを配置
        const rect = this.canvas.getBoundingClientRect();
        let elementX = rect.left + element.x;
        let elementY = rect.top + element.y;
        let elementWidth = Math.max(200, element.width);

        if (element.type === 'actor') {
            const boxHeight = 32;
            elementX = rect.left + element.x + 8;
            elementY = rect.top + element.y + element.height - boxHeight;
            elementWidth = Math.max(200, element.width - 16);
        }
        
        input.style.left = elementX + 'px';
        input.style.top = elementY + 'px';
        input.style.width = elementWidth + 'px';
        input.style.height = '30px';
        input.style.zIndex = '1000';
        input.style.padding = '5px';
        input.style.border = '2px solid #007bff';
        input.style.borderRadius = '4px';
        input.style.fontSize = '14px';
        input.style.fontFamily = 'Arial, sans-serif';
        input.style.backgroundColor = 'white';
        input.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
        input.style.outline = 'none';

        document.body.appendChild(input);
        input.focus();
        input.select();

        const finishEdit = () => {
            this.pushHistory();
            element.text = input.value;
            document.body.removeChild(input);
            this.isEditingText = false;
            this.textEditElement = null;
            this.highlightedElement = null;
            this.redraw();
            this.debouncedSave();
        };

        input.addEventListener('blur', finishEdit);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                finishEdit();
            } else if (e.key === 'Escape') {
                document.body.removeChild(input);
                this.isEditingText = false;
                this.textEditElement = null;
                this.highlightedElement = null;
                this.redraw();
            }
        });
    }

    handleContextMenu(e) {
        e.preventDefault();
        // Context menu implementation can be added here
    }

    showNotification(message, type = 'info') {
        // Create toast notification
        const toast = document.createElement('div');
        toast.className = `toast align-items-center text-white bg-${type === 'error' ? 'danger' : type} border-0`;
        toast.setAttribute('role', 'alert');
        toast.innerHTML = `
            <div class="d-flex">
                <div class="toast-body">${message}</div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>
        `;

        // Add to container
        let container = document.querySelector('.toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        
        container.appendChild(toast);
        
        // Show toast
        const bsToast = new bootstrap.Toast(toast);
        bsToast.show();
        
        // Remove after hide
        toast.addEventListener('hidden.bs.toast', () => {
            toast.remove();
        });
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new FlowCreator();
});
