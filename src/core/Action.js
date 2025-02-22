/**
 * @fileoverview
 * @author Sebastian Castro - sebastian.castro@picknik.ai
 */

var ActionGoal = require('./ActionGoal');
var ActionFeedback = require('./ActionFeedback');
var ActionResult = require('./ActionResult');
var EventEmitter2 = require('eventemitter2').EventEmitter2;

/**
 * A ROS 2 action client.
 *
 * @constructor
 * @params options - possible keys include:
 *   * ros - the ROSLIB.Ros connection handle
 *   * name - the service name, like '/fibonacci'
 *   * actionType - the action type, like 'action_tutorials_interfaces/Fibonacci'
 */
function Action(options) {
  options = options || {};
  this.ros = options.ros;
  this.name = options.name;
  this.actionType = options.actionType;
  this.isAdvertised = false;

  this._actionCallback = null;
  this._cancelCallback = null;
}
Action.prototype.__proto__ = EventEmitter2.prototype;

/**
 * Calls the service. Returns the service response in the
 * callback. Does nothing if this service is currently advertised.
 *
 * @param request - the ROSLIB.ServiceRequest to send
 * @param resultCallback - function with params:
 *   * result - the result from the action
 * @param feedbackCallback - the callback function when the action publishes feedback (optional). Params:
 *   * feedback - the feedback from the action
 * @param failedCallback - the callback function when the action failed (optional). Params:
 *   * error - the error message reported by ROS
 */
Action.prototype.sendGoal = function(request, resultCallback, feedbackCallback, failedCallback) {
  if (this.isAdvertised) {
    return;
  }

  var actionGoalId = 'send_action_goal:' + this.name + ':' + (++this.ros.idCounter);

  if (resultCallback || failedCallback) {
    this.ros.on(actionGoalId, function(message) {
      if (message.result !== undefined && message.result === false) {
        if (typeof failedCallback === 'function') {
          failedCallback(message.values);
        }
      } else if (message.op === 'action_feedback' && typeof feedbackCallback === 'function') {
        feedbackCallback(new ActionResult(message.values));
      } else if (message.op === 'action_result' && typeof resultCallback === 'function') {
        resultCallback(new ActionResult(message.values));
      }
    });
  }

  var call = {
    op : 'send_action_goal',
    id : actionGoalId,
    action : this.name,
    action_type: this.actionType,
    args : request,
    feedback : true,
  };
  this.ros.callOnConnection(call);

  return actionGoalId;
};

Action.prototype.cancelGoal = function(id) {
  var call = {
    op: 'cancel_action_goal',
    id: id,
    action: this.name,
  };
  this.ros.callOnConnection(call);
};

/**
 * Advertise the action. This turns the Action object from a client
 * into a server. The callback will be called with every goal sent to this action.
 *
 * @param callback - This works similarly to the callback for a C++ action and should take the following params:
 *   * goal - the action goal
 *   It should return true if the action has finished successfully,
 *   i.e. without any fatal errors.
 */
Action.prototype.advertise = function(callback) {
  if (this.isAdvertised || typeof callback !== 'function') {
    return;
  }

  this._actionCallback = callback;
  this.ros.on(this.name, this._executeAction.bind(this));
  this.ros.callOnConnection({
    op: 'advertise_action',
    type: this.actionType,
    action: this.name
  });
  this.isAdvertised = true;
};

Action.prototype.unadvertise = function() {
  if (!this.isAdvertised) {
    return;
  }
  this.ros.callOnConnection({
    op: 'unadvertise_action',
    action: this.name
  });
  this.isAdvertised = false;
};

Action.prototype._executeAction = function(rosbridgeRequest) {
  var id;
  if (rosbridgeRequest.id) {
    id = rosbridgeRequest.id;
  }

  this._actionCallback(rosbridgeRequest.args, id);
};

Action.prototype.sendFeedback = function(id, feedback) {
  var call = {
    op: 'action_feedback',
    id: id,
    action: this.name,
    values: new ActionFeedback(feedback),
  };
  this.ros.callOnConnection(call);
};

Action.prototype.setSucceeded = function(id, result) {
  var call = {
    op: 'action_result',
    id: id,
    action: this.name,
    values: new ActionResult(result),
    result: true,
  };
  this.ros.callOnConnection(call);
};

Action.prototype.setFailed = function(id) {
  var call = {
    op: 'action_result',
    id: id,
    action: this.name,
    result: false,
  };
  this.ros.callOnConnection(call);
};

module.exports = Action;
