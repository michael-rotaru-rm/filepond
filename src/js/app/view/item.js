import { createView, createRoute } from '../frame/index';
import { fileWrapper } from './fileWrapper';
import { panel } from './panel';
import { createDragHelper } from '../utils/createDragHelper';

const ITEM_TRANSLATE_SPRING = {
    type: 'spring',
    stiffness: 0.75,
    damping: 0.45,
    mass: 10
}

const ITEM_SCALE_SPRING = 'spring';


const StateMap = {
    DID_START_ITEM_LOAD: 'busy',
    DID_UPDATE_ITEM_LOAD_PROGRESS: 'loading',
    DID_THROW_ITEM_INVALID: 'load-invalid',
    DID_THROW_ITEM_LOAD_ERROR: 'load-error',
    DID_LOAD_ITEM: 'idle',
    DID_THROW_ITEM_REMOVE_ERROR: 'remove-error',
    DID_START_ITEM_REMOVE: 'busy',
    DID_START_ITEM_PROCESSING: 'busy processing',
    DID_REQUEST_ITEM_PROCESSING: 'busy processing',
    DID_UPDATE_ITEM_PROCESS_PROGRESS: 'processing',
    DID_COMPLETE_ITEM_PROCESSING: 'processing-complete',
    DID_THROW_ITEM_PROCESSING_ERROR: 'processing-error',
    DID_THROW_ITEM_PROCESSING_REVERT_ERROR: 'processing-revert-error',
    DID_ABORT_ITEM_PROCESSING: 'cancelled',
    DID_REVERT_ITEM_PROCESSING: 'idle'
};

/**
 * Creates the file view
 */
const create = ({ root, props }) => {

    // select
    root.ref.handleClick = e => root.dispatch('DID_ACTIVATE_ITEM', { id: props.id });

    // set id
    root.element.id = `filepond--item-${props.id}`;
    root.element.addEventListener('click', root.ref.handleClick);
    
    // file view
    root.ref.container = root.appendChildView(
        root.createChildView(fileWrapper, { id: props.id })
    );

    // file panel
    root.ref.panel = root.appendChildView(
        root.createChildView(panel, { name: 'item-panel' })
    );

    // default start height
    root.ref.panel.height = null;

    // by default not marked for removal
    props.markedForRemoval = false;

    // if not allowed to reorder file items, exit here
    if (!root.query('GET_ALLOW_REORDER')) return;

    // set to idle so shows grab cursor
    root.element.dataset.dragState = 'idle';

    var startInteraction = function(e, isTouch) {
        var pageX = isTouch ? e.touches[0].pageX : e.pageX;
        var pageY = isTouch ? e.touches[0].pageY : e.pageY;
        var rect = e.target.getBoundingClientRect();
        var offsetX = isTouch ? (e.touches[0].pageX - window.pageXOffset - rect.left) : e.offsetX;
        var offsetY = isTouch ? (e.touches[0].pageY - window.pageYOffset - rect.top) : e.offsetY;

        if (!isTouch) e.preventDefault(); // Prevent text selection on drag for non-touch devices

        var removedActivateListener = false;

        var origin = {
            x: pageX,
            y: pageY,
        };

        props.dragOrigin = {
            x: root.translateX,
            y: root.translateY,
        };

        props.dragCenter = {
            x: offsetX,
            y: offsetY,
        };

        var dragState = createDragHelper(root.query('GET_ACTIVE_ITEMS'));

        root.dispatch('DID_GRAB_ITEM', { id: props.id, dragState: dragState });

        var moveHandler = function(e) {
            var pageX = isTouch ? e.touches[0].pageX : e.pageX;
            var pageY = isTouch ? e.touches[0].pageY : e.pageY;
            
            e.preventDefault();
            if(isTouch){
                e.stopImmediatePropagation();
            }

            props.dragOffset = {
                x: pageX - origin.x,
                y: pageY - origin.y,
            };

            // if dragged stop listening to clicks, will re-add when done dragging
            var dist =
                props.dragOffset.x * props.dragOffset.x +
                props.dragOffset.y * props.dragOffset.y;
            if (dist > 16 && !removedActivateListener) {
                removedActivateListener = true;
                root.element.removeEventListener('click', root.ref.handleClick);
            }

            root.dispatch('DID_DRAG_ITEM', { id: props.id, dragState: dragState });
        };

        var endHandler = function(e) {
            var pageX = isTouch ? e.changedTouches[0].pageX : e.pageX;
            var pageY = isTouch ? e.changedTouches[0].pageY : e.pageY;

            document.removeEventListener('mousemove', moveHandler);
            document.removeEventListener('touchmove', moveHandler);
            document.removeEventListener('mouseup', endHandler);
            document.removeEventListener('touchend', endHandler);
            
            props.dragOffset = {
                x: pageX - origin.x,
                y: pageY - origin.y,
            };

            root.dispatch('DID_DROP_ITEM', { id: props.id, dragState: dragState });

            // start listening to clicks again
            if (removedActivateListener) {
                setTimeout(function() {
                    return root.element.addEventListener('click', root.ref.handleClick);
                }, 0);
            }
        };

        document.addEventListener(isTouch ? 'touchmove' : 'mousemove', moveHandler, { passive: false });
        document.addEventListener(isTouch ? 'touchend' : 'mouseup', endHandler);
    };

    var grab = function grab(e) {
        if (e.type === 'mousedown' && e.button !== 0) return; // Only handle left-click for mousedown
        startInteraction(e, e.type === 'touchstart');
    };

    root.element.addEventListener('mousedown', grab);
    root.element.addEventListener('touchstart', grab);
};

const route = createRoute({
    DID_UPDATE_PANEL_HEIGHT: ({ root, action }) => {
        root.height = action.height;
    }
});

const write = createRoute({
    DID_GRAB_ITEM: ({ root, props }) => {
        props.dragOrigin = {
            x: root.translateX,
            y: root.translateY
        }
    },
    DID_DRAG_ITEM: ({ root }) => {
        root.element.dataset.dragState = 'drag';
    },
    DID_DROP_ITEM: ({ root, props }) => {
        props.dragOffset = null;
        props.dragOrigin = null;
        root.element.dataset.dragState = 'drop';
    }
}, ({ root, actions, props, shouldOptimize }) => {

    if (root.element.dataset.dragState === 'drop') {
        if (root.scaleX <= 1) {
            root.element.dataset.dragState = 'idle';
        }
    }

    // select last state change action
    let action = actions.concat()
        .filter(action => /^DID_/.test(action.type))
        .reverse()
        .find(action => StateMap[action.type]);

    // no need to set same state twice
    if (action && action.type !== props.currentState) {
            
        // set current state
        props.currentState = action.type;

        // set state
        root.element.dataset.filepondItemState = StateMap[props.currentState] || '';
    }

    // route actions
    const aspectRatio = root.query('GET_ITEM_PANEL_ASPECT_RATIO') || root.query('GET_PANEL_ASPECT_RATIO');
    if (!aspectRatio) {
        route({ root, actions, props });
        if (!root.height && root.ref.container.rect.element.height > 0) {
            root.height = root.ref.container.rect.element.height;
        }
    }
    else if (!shouldOptimize) {
        root.height = root.rect.element.width * aspectRatio;
    }
    
    // sync panel height with item height
    if (shouldOptimize) {
        root.ref.panel.height = null;
    }

    root.ref.panel.height = root.height;
});

export const item = createView({
    create,
    write,
    destroy: ({ root, props }) => {
        root.element.removeEventListener('click', root.ref.handleClick);
        root.dispatch('RELEASE_ITEM', { query: props.id });
    },
    tag: 'li',
    name: 'item',
    mixins: {
        apis: ['id', 'interactionMethod', 'markedForRemoval', 'spawnDate', 'dragCenter', 'dragOrigin', 'dragOffset'],
        styles: [
            'translateX',
            'translateY',
            'scaleX',
            'scaleY',
            'opacity',
            'height'
        ],
        animations: {
            scaleX: ITEM_SCALE_SPRING,
            scaleY: ITEM_SCALE_SPRING,
            translateX: ITEM_TRANSLATE_SPRING,
            translateY: ITEM_TRANSLATE_SPRING,
            opacity: { type: 'tween', duration: 150 }
        }
    }
});
