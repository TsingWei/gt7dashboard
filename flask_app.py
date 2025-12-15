import copy
import logging
import os
import time
from typing import List
from flask import Flask, render_template, jsonify, request
from flask_socketio import SocketIO, emit

from gt7dashboard import gt7communication, gt7helper, gt7lap
from gt7dashboard import gt7diagrams_flask
from gt7dashboard.gt7helper import (
    load_laps_from_pickle,
    save_laps_to_pickle,
    list_lap_files_from_path,
    calculate_time_diff_by_distance, 
    save_laps_to_json, 
    load_laps_from_json,
)
from gt7dashboard.gt7lap import Lap

# Set up logging
logger = logging.getLogger('flask_app')
logger.setLevel(logging.DEBUG)

# Initialize Flask app
app = Flask(__name__)
app.config['SECRET_KEY'] = 'gt7dashboard-secret-key'
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

# Global state variables
g_laps_stored = []
g_session_stored = None
g_connection_status_stored = None
g_reference_lap_selected = None
g_stored_fuel_map = None
g_telemetry_update_needed = False
gt7comm = None


def init_gt7_communication():
    """Initialize GT7 communication"""
    global gt7comm
    
    playstation_ip = os.environ.get("GT7_PLAYSTATION_IP")
    load_laps_path = os.environ.get("GT7_LOAD_LAPS_PATH")

    if not playstation_ip:
        playstation_ip = "255.255.255.255"
        logger.info(f"No IP set in env var GT7_PLAYSTATION_IP using broadcast at {playstation_ip}")

    gt7comm = gt7communication.GT7Communication(playstation_ip)

    if load_laps_path:
        gt7comm.load_laps(
            load_laps_from_pickle(load_laps_path), replace_other_laps=True
        )

    gt7comm.start()


@app.route('/')
def index():
    """Render the main dashboard page"""
    # Get available lap files
    stored_lap_files = list_lap_files_from_path(os.path.join(os.getcwd(), "data"))
    return render_template('index.html', lap_files=stored_lap_files)


@app.route('/api/connection_status')
def connection_status():
    """Get connection status"""
    if gt7comm:
        return jsonify({
            'connected': gt7comm.is_connected()
        })
    return jsonify({'connected': False})


@app.route('/api/laps')
def get_laps():
    """Get current laps data"""
    if not gt7comm:
        return jsonify({'laps': []})
    
    laps = gt7comm.get_laps()
    
    # Convert laps to serializable format
    laps_data = []
    for i, lap in enumerate(laps):
        laps_data.append({
            'number': lap.number if hasattr(lap, 'number') else i,
            'title': lap.title,
            'car_name': lap.car_name(),
            'data': lap.get_data_dict() if hasattr(lap, 'get_data_dict') else {}
        })
    
    return jsonify({'laps': laps_data})


@app.route('/api/lap_data')
def get_lap_data():
    """Get detailed lap data for charts"""
    if not gt7comm:
        return jsonify({'error': 'GT7 communication not initialized'})
    
    global g_laps_stored, g_reference_lap_selected
    
    laps = gt7comm.get_laps()
    
    if len(laps) == 0:
        return jsonify({'last_lap': None, 'reference_lap': None, 'laps_count': 0})
    
    last_lap, reference_lap, median_lap = gt7helper.get_last_reference_median_lap(
        laps, reference_lap_selected=g_reference_lap_selected
    )
    
    result = {
        'laps_count': len(laps),
        'last_lap': None,
        'reference_lap': None,
        'median_lap': None,
        'time_diff': None
    }
    
    if last_lap:
        result['last_lap'] = last_lap.get_data_dict()
        
    if reference_lap and len(reference_lap.data_speed) > 0:
        result['reference_lap'] = reference_lap.get_data_dict()
        result['time_diff'] = calculate_time_diff_by_distance(reference_lap, last_lap)
        
    if median_lap:
        result['median_lap'] = median_lap.get_data_dict()
    
    return jsonify(result)


@app.route('/api/tuning_info')
def get_tuning_info():
    """Get tuning information"""
    if not gt7comm:
        return jsonify({})
    
    return jsonify({
        'max_speed': gt7comm.session.max_speed if gt7comm.session else 0,
        'min_body_height': gt7comm.session.min_body_height if gt7comm.session else 0
    })


@app.route('/api/fuel_map')
def get_fuel_map():
    """Get fuel map data"""
    if not gt7comm or len(gt7comm.laps) == 0:
        return jsonify({'fuel_map': ''})
    
    last_lap = gt7comm.laps[0]
    fuel_map_html = gt7diagrams_flask.get_fuel_map_html_table(last_lap)
    
    return jsonify({'fuel_map': fuel_map_html})


@app.route('/api/reset', methods=['POST'])
def reset_laps():
    """Reset all laps"""
    global g_telemetry_update_needed
    
    if gt7comm:
        gt7comm.load_laps([], replace_other_laps=True)
        gt7comm.reset()
        g_telemetry_update_needed = True
        logger.info("Laps reset")
        return jsonify({'status': 'success'})
    
    return jsonify({'status': 'error', 'message': 'GT7 communication not initialized'})


@app.route('/api/save', methods=['POST'])
def save_laps():
    """Save current laps to file"""
    if gt7comm and len(gt7comm.laps) > 0:
        path = save_laps_to_json(gt7comm.laps)
        logger.info("Saved %d laps as %s" % (len(gt7comm.laps), path))
        return jsonify({'status': 'success', 'path': path})
    
    return jsonify({'status': 'error', 'message': 'No laps to save'})


@app.route('/api/load', methods=['POST'])
def load_laps():
    """Load laps from file"""
    data = request.get_json()
    filename = data.get('filename')
    
    if filename and gt7comm:
        try:
            gt7comm.load_laps(load_laps_from_json(filename), replace_other_laps=True)
            logger.info("Loading %s" % filename)
            return jsonify({'status': 'success'})
        except Exception as e:
            logger.error(f"Error loading laps: {e}")
            return jsonify({'status': 'error', 'message': str(e)})
    
    return jsonify({'status': 'error', 'message': 'Invalid filename or GT7 communication not initialized'})


@app.route('/api/log_lap', methods=['POST'])
def log_lap_manually():
    """Log a lap manually"""
    if gt7comm:
        gt7comm.finish_lap(manual=True)
        logger.info("Added a lap manually to the list of laps")
        return jsonify({'status': 'success'})
    
    return jsonify({'status': 'error', 'message': 'GT7 communication not initialized'})


@app.route('/api/set_reference_lap', methods=['POST'])
def set_reference_lap():
    """Set reference lap"""
    global g_reference_lap_selected, g_telemetry_update_needed, g_laps_stored
    
    data = request.get_json()
    lap_index = data.get('lap_index', -1)
    
    if int(lap_index) == -1:
        g_reference_lap_selected = None
    else:
        if len(g_laps_stored) > int(lap_index):
            g_reference_lap_selected = g_laps_stored[int(lap_index)]
            logger.info("Loading lap %s as reference" % g_laps_stored[int(lap_index)].format())
    
    g_telemetry_update_needed = True
    return jsonify({'status': 'success'})


@app.route('/api/set_always_record', methods=['POST'])
def set_always_record():
    """Set always record data"""
    data = request.get_json()
    always_record = data.get('always_record', False)
    
    if gt7comm:
        gt7comm.always_record_data = always_record
        logger.info(f"Set always record data to {always_record}")
        return jsonify({'status': 'success'})
    
    return jsonify({'status': 'error', 'message': 'GT7 communication not initialized'})


def update_lap_change():
    """Check for lap changes and emit updates via websocket"""
    global g_laps_stored, g_session_stored, g_connection_status_stored, g_telemetry_update_needed
    
    if not gt7comm:
        return
    
    laps = gt7comm.get_laps()
    
    # Check if anything changed
    connection_changed = gt7comm.is_connected() != g_connection_status_stored
    session_changed = gt7comm.session != g_session_stored
    laps_changed = laps != g_laps_stored or g_telemetry_update_needed
    
    if connection_changed:
        g_connection_status_stored = copy.copy(gt7comm.is_connected())
        socketio.emit('connection_update', {'connected': g_connection_status_stored})
    
    if session_changed:
        g_session_stored = copy.copy(gt7comm.session)
        socketio.emit('session_update', {
            'max_speed': gt7comm.session.max_speed if gt7comm.session else 0,
            'min_body_height': gt7comm.session.min_body_height if gt7comm.session else 0
        })
    
    if laps_changed:
        logger.debug("Rerendering laps")
        g_laps_stored = laps.copy()
        g_telemetry_update_needed = False
        
        # Emit lap update
        socketio.emit('laps_update', {'laps_count': len(laps)})


def background_update_task():
    """Background task to check for updates and emit via websocket"""
    while True:
        update_lap_change()
        socketio.sleep(1)


@socketio.on('connect')
def handle_connect():
    """Handle client connection"""
    logger.info('Client connected')
    emit('connected', {'data': 'Connected to GT7 Dashboard'})


@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnect"""
    logger.info('Client disconnected')


if __name__ == '__main__':
    # Initialize GT7 communication
    init_gt7_communication()
    
    # Start background task
    socketio.start_background_task(background_update_task)
    
    # Run the Flask app
    port = int(os.environ.get('PORT', 5006))
    socketio.run(app, host='0.0.0.0', port=port, debug=True)
