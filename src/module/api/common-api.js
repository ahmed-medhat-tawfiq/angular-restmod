'use strict';

RMModule.factory('RMCommonApi', ['$http', '$q', 'RMPackerCache', function($http, $q, packerCache) {

  var EMPTY_ARRAY = [];

  function wrapPromise(_ctx, _fun) {
    var dsp = _ctx.$dispatcher();
    return function(_last) {
      // save and reset promise
      var oldPromise = _ctx.$promise;
      _ctx.$promise = undefined;
      try {
        _ctx.$last = _last;
        var result = dsp ? _ctx.$decorate(dsp, _fun, [_ctx]) : _fun.call(_ctx, _ctx);
        return result === undefined ? _ctx.$promise : result;
      } finally {
        _ctx.$promise = oldPromise; // restore old promise
      }
    };
  }

  /**
   * @class CommonApi
   *
   * @description
   *
   * Provides a common framework for other restmod components.
   *
   * This API is included in {@link RecordApi} and {@link CollectionApi}.
   * making its methods available in every structure generated by restmod.
   *
   * TODO: Describe hook mechanism, promise mechanism and send lifecycle.
   *
   * @property {promise} $promise The last operation promise (undefined if no promise has been created yet)
   * @property {array} $pending Pending requests associated to this resource (undefined if no request has been initiated)
   * @property {object} $$cb Scope call backs (undefined if no callbacks have been defined, private api)
   * @property {function} $$dsp The current event dispatcher (private api)
   */
  var CommonApi = {

    // Hooks API

    /**
     * @memberof CommonApi#
     *
     * @description Executes a given hook callbacks using the current dispatcher context.
     *
     * This method can be used to provide custom object lifecycle hooks.
     *
     * Usage:
     *
     * ```javascript
     * var mixin = restmod.mixin({
     *   triggerDummy: function(_param) {
     *     this.$dispatch('dummy-hook', _param);
     *   }
     * });
     *
     * // Then hook can be used at model definition to provide type-level customization:
     * var Bike $resmod.model('/api/bikes', mixin, {
     *   '~dummy-hook': function() {
     *     alert('This is called for every bike');
     *   }
     * };
     *
     * // or at instance level:
     * var myBike = Bike.$build();
     * myBike.$on('dummy-hook', function() {
     *   alert('This is called for myBike only');
     * });
     *
     * // or event at decorated context level
     * myBike.$decorate({
     *   'dummy-hook': function() {
     *     alert('This is called for myBike only inside the decorated context');
     *   }
     * }, fuction() {
     *  // decorated context
     * });
     * ```
     *
     * @param  {string} _hook Hook name
     * @param  {array} _args Hook arguments
     * @param  {object} _ctx Hook execution context override
     *
     * @return {CommonApi} self
     */
    $dispatch: function(_hook, _args, _ctx) {
      var cbs, i, cb, dsp = this.$$dsp;

      if(!_ctx) _ctx = this;

      // context callbacks
      if(dsp) {
        this.$$dsp = undefined; // disable dsp for hooks
        dsp(_hook, _args, _ctx);
      }

      // instance callbacks
      if(this.$$cb && (cbs = this.$$cb[_hook])) {
        for(i = 0; !!(cb = cbs[i]); i++) {
          cb.apply(_ctx, _args || EMPTY_ARRAY);
        }
      }

      // bubble up the object scope, bubble to type only if there isnt a viable parent scope.
      if(this.$scope && this.$scope.$dispatch) {
        this.$scope.$dispatch(_hook, _args, _ctx);
      } else if(this.$type) {
        this.$type.$dispatch(_hook, _args, _ctx);
      }

      this.$$dsp = dsp; // reenable dsp.

      return this;
    },

    /**
     * @memberof CommonApi#
     *
     * @description Registers an instance hook.
     *
     * An instance hook is called only for events generated by the calling object.
     *
     * ```javascript
     * var bike = Model.$build(), bike2 = Model.$build();
     * bike.$on('before-save', function() { alert('saved!'); });
     *
     * bike.$save(); // 'saved!' alert is shown after bike is saved
     * bike2.$save(); // no alert is shown after bike2 is saved
     * ```
     *
     * @param {string} _hook Hook name
     * @param {function} _fun Callback
     * @return {CommonApi} self
     */
    $on: function(_hook, _fun) {
      var hooks = (this.$$cb || (this.$$cb = {}))[_hook] || (this.$$cb[_hook] = []);
      hooks.push(_fun);
      return this;
    },

    /**
     * @memberof CommonApi#
     *
     * @description Registers hooks to be used only inside the given function (decorated context).
     *
     * ```javascript
     * // special fetch method that sends a special token header.
     * restmod.mixin({
     *   $fetchWithToken: function(_token) {
     *     return this.$decorate({
     *       'before-fetch': function(_req) {
     *         _req.headers = _req.headers || {};
     *         _req.headers['Token'] = _token;
     *       }
     *     ), function() {
     *       return this.$fetch();
     *     })
     *   }
     * });
     * ```
     *
     * @param {object|function} _hooks Hook mapping object or hook execution method.
     * @param {function} _fun Function to be executed in with decorated context, this function is executed in the callee object context.
     * @return {CommonApi} self
     */
    $decorate: function(_hooks, _fun, _args) {

      var oldDispatcher = this.$$dsp;

      // set new dispatcher
      this.$$dsp = (typeof _hooks === 'function' || !_hooks) ? _hooks : function(_hook, _args, _ctx) {
        if(oldDispatcher) oldDispatcher.apply(null, arguments);
        var extraCb = _hooks[_hook];
        if(extraCb) extraCb.apply(_ctx, _args || EMPTY_ARRAY);
      };

      try {
        return _fun.apply(this, _args);
      } finally {
        // reset dispatcher with old value
        this.$$dsp = oldDispatcher;
      }
    },

    /**
     * @memberof CommonApi#
     *
     * @description Retrieves the current object's event dispatcher function.
     *
     * This method can be used in conjuction with `$decorate` to provide a consistent hook context
     * during async operations. This is important when building extensions that want to support the
     * contextual hook system in asynchronic operations.
     *
     * For more information aboout contextual hooks, see the {@link CommonApi#decorate} documentation.
     *
     * Usage:
     *
     * ```javascript
     * restmod.mixin({
     *   $saveAndTrack: function() {
     *     var dsp = this.$dispatcher(), // capture the current dispatcher function.
     *         self = this;
     *     this.$save().$then(function() {
     *       this.$send({ path: '/traces', data: 'ble' }, function() {
     *         this.$decorate(dsp, function() {
     *           // the event is dispatched using the dispatcher function available when $saveAndTrack was called.
     *           this.$dispatch('trace-stored');
     *         });
     *       });
     *     });
     *   }
     * })
     * ```
     *
     * @return {function} Dispatcher evaluator
     */
    $dispatcher: function() {
      return this.$$dsp;
    },

    // Promise API

    /**
     * @memberof CommonApi#
     *
     * @description Returns this object last promise.
     *
     * If promise does not exist, then a new one is generated that resolves to the object itsef. The
     * new promise is not set as the current object promise, for that use `$then`.
     *
     * Usage:
     *
     * ```javascript
     * col.$fetch().$asPromise();
     * ```
     *
     * @return {promise} $q promise
     */
    $asPromise: function() {
      var _this = this;
      return this.$promise ? this.$promise.then(
        function() { return _this; },
        function() { return $q.reject(_this); }
      ) : $q.when(this);
    },

    /**
     * @memberof CommonApi#
     *
     * @description Promise chaining method, keeps the model instance as the chain context.
     *
     * Calls `$q.then` on the model's last promise.
     *
     * Usage:
     *
     * ```javascript
     * col.$fetch().$then(function() { });
     * ```
     *
     * @param {function} _success success callback
     * @param {function} _error error callback
     * @return {CommonApi} self
     */
    $then: function(_success, _error) {

      if(!this.$promise) { // TODO: $promise is resolved...
        // if there is no pending promise, just execute success callback,
        // if callback returns a promise, then set it as the current promise.
        this.$last = null;
        var result = _success.call(this, this);
        if(result !== undefined) this.$promise = $q.when(result);
      } else {
        this.$promise = this.$promise.then(
          _success ? wrapPromise(this, _success) : _success,
          _error ? wrapPromise(this, _error) : _error
        );
      }

      return this;
    },

    /**
     * @memberof CommonApi#
     *
     * @description Promise chaining, keeps the model instance as the chain context.
     *
     * Calls ´$q.finally´ on the collection's last promise, updates last promise with finally result.
     *
     * Usage:
     *
     * ```javascript
     * col.$fetch().$finally(function() { });
     * ```
     *
     * @param {function} _cb callback
     * @return {CommonApi} self
     */
    $finally: function(_cb) {
      this.$promise = this.$asPromise()['finally'](_cb);
      return this;
    },

    // Communication API

    /**
     * @memberof CommonApi#
     *
     * @description Low level communication method, wraps the $http api.
     *
     * * You can access last request promise using the `$asPromise` method.
     * * Pending requests will be available at the $pending property (array).
     * * Current request execution status can be queried using the $status property (current request, not last).
     * * The $status property refers to the current request inside $send `_success` and `_error` callbacks.
     *
     * @param {object} _options $http options
     * @param {function} _success sucess callback (sync)
     * @param {function} _error error callback (sync)
     * @return {CommonApi} self
     */
    $send: function(_options, _success, _error) {

      this.$pending = (this.$pending || []);
      this.$pending.push(_options);

      return this.$then(function() {

        // if request was canceled, then just return a resolved promise
        if(_options.canceled) {
          this.$pending.splice(0, 1);
          this.$status = 'canceled';
          return;
        }

        this.$response = null;
        this.$status = 'pending';
        this.$dispatch('before-request', [_options]);

        var dsp = this.$dispatcher(), _this = this;
        return $http(_options).then(function(_response) {

          return _this.$decorate(dsp, function() {

            this.$pending.splice(0, 1);

            if(_options.canceled) {
              // if request was canceled during request, ignore post request actions.
              this.$status =  'canceled';
            } else {
              this.$status = 'ok';
              this.$response = _response;

              this.$dispatch('after-request', [_response]);
              if(_success) _success.call(this, _response);
            }
          });

        }, function(_response) {

          return _this.$decorate(dsp, function() {

            this.$pending.splice(0, 1);

            if(_options.canceled) {
              // if request was canceled during request, ignore error handling
              this.$status = 'canceled';
              return this;
            } else {
              this.$status = 'error';
              this.$response = _response;

              // IDEA: Consider flushing pending request in case of an error. Also continue ignoring requests
              // until the error flag is reset by user.

              this.$dispatch('after-request-error', [_response]);
              if(_error) _error.call(this, _response);
              return $q.reject(this);
            }
          });
        });
      });
    },

    /**
     * @memberof CommonApi#
     *
     * @description Cancels all pending requests initiated with $send.
     *
     * @return {CommonApi} self
     */
    $cancel: function() {
      // cancel every pending request.
      if(this.$pending) {
        angular.forEach(this.$pending, function(_config) {
          _config.canceled = true;
        });
      }

      return this;
    },

    /**
     * @memberof CommonApi#
     *
     * @description Returns true if object has queued pending request
     *
     * @return {Boolean} Object request pending status.
     */
    $hasPendingRequests: function() {
      var pendingCount = 0;

      if(this.$pending) {
        angular.forEach(this.$pending, function(_config) {
          if(!_config.canceled) pendingCount++;
        });
      }

      return pendingCount > 0;
    },

    /// Misc common methods

    /**
     * @memberof CommonApi#
     *
     * @description
     *
     * Unpacks and decode raw data from a server generated structure.
     *
     * ATTENTION: do not override this method to change the object wrapping strategy,
     * instead, check {@link BuilderApi#setPacker} for instruction about loading a new packer.
     *
     * @param  {mixed} _raw Raw server data
     * @param  {string} _mask 'CRU' mask
     * @return {CommonApi} this
     */
    $unwrap: function(_raw, _mask) {
      try {
        packerCache.prepare();
        _raw = this.$$unpack(_raw);
        return this.$decode(_raw, _mask);
      } finally {
        packerCache.clear();
      }
    },

    /**
     * @memberof CommonApi#
     *
     * @description
     *
     * Encode and packs object into a server compatible structure that can be used for PUT/POST operations.
     *
     * ATTENTION: do not override this method to change the object wrapping strategy,
     * instead, check {@link BuilderApi#setPacker} for instruction about loading a new packer.
     *
     * @param  {string} _mask 'CRU' mask
     * @return {string} raw data
     */
    $wrap: function(_mask) {
      var raw = this.$encode(_mask);
      raw = this.$$pack(raw);
      return raw;
    }
  };

  return CommonApi;

}]);