var GetValue = require('../utils/object/GetValue');
var GetEaseFunction = require('./GetEaseFunction');
var CloneObject = require('../utils/object/Clone');
var MergeRight = require('../utils/object/MergeRight');
// var TweenData = require('./TweenData');

var RESERVED = [ 'targets', 'ease', 'duration', 'yoyo', 'repeat', 'loop', 'paused', 'useFrames', 'offset' ];

/*
    The following are all the same

    var tween = this.tweens.add({
        targets: player,
        x: 200,
        duration: 2000,
        ease: 'Power1',
        yoyo: true
    });

    var tween = this.tweens.add({
        targets: player,
        props: {
            x: 200
        }
        duration: 2000,
        ease: 'Power1',
        yoyo: true
    });

    var tween = this.tweens.add({
        targets: player,
        x: { value: 200, duration: 2000, ease: 'Power1', yoyo: true }
    });

    var tween = this.tweens.add({
        targets: player,
        props: {
            x: { value: 200, duration: 2000, ease: 'Power1', yoyo: true }
        }
    });

    //  Chained property tweens:
    //  Each tween uses the same duration and ease because they've been 'globally' defined, except the middle one,
    //  which uses its own duration as it overrides the global one

    var tween = this.tweens.add({
        targets: player,
        x: [ { value: 200 }, { value: 300, duration: 50 }, { value: 400 } ],
        duration: 2000,
        ease: 'Power1',
        yoyo: true
    });

    //  Multiple property tweens:

    var tween = this.tweens.add({
        targets: player,
        x: { value: 400, duration: 2000, ease: 'Power1' },
        y: { value: 300, duration: 1000, ease: 'Sine' }
    });

    var tween = this.tweens.add({
        targets: player,
        props: {
            x: { value: 400, duration: 2000, ease: 'Power1' },
            y: { value: 300, duration: 1000, ease: 'Sine' }
        }
    });

 */

var Tween = function (manager, config)
{
    this.manager = manager;

    //  The following config properties are reserved words, i.e. they map to Tween related functions
    //  and properties. However if you've got a target that has a property that matches one of the
    //  reserved words, i.e. Target.duration - that you want to tween, then pass it inside a property
    //  called `vars`. If present it will use the contents of the `vars` object instead.

    this.targets = this.setTargets(GetValue(config, 'targets', null));

    //  The properties on the targets that are being tweened.
    //  The properties are tween simultaneously.
    //  This object contains the properties which each has an array of TweenData objects,
    //  that are updated in sequence.
    this.props = {};

    this.ease = GetEaseFunction(GetValue(config, 'ease', 'Power0'));

    this.duration = GetValue(config, 'duration', 1000);

    //  Only applied if this Tween is part of a Timeline
    this.offset = GetValue(config, 'offset', 0);

    this.yoyo = GetValue(config, 'yoyo', false);
    this.repeat = GetValue(config, 'repeat', 0);
    this.delay = GetValue(config, 'delay', 0);
    this.onCompleteDelay = GetValue(config, 'onCompleteDelay', 0);

    //  Short-cut for repeat -1 (if set, overrides repeat value)
    this.loop = GetValue(config, 'loop', false);

    if (this.repeat === -1)
    {
        this.loop = true;
    }

    //  Move to global
    this.defaultInstance = {
        key: '',
        running: false,
        complete: false,
        current: 0,
        queue: [],
        totalDuration: 0
    };

    this.defaultTweenData = {
        value: undefined,
        progress: 0,
        startTime: 0,
        ease: this.ease,
        duration: this.duration,
        yoyo: this.yoyo,
        repeat: this.repeat,
        loop: this.loop,
        delay: this.delay,
        startAt: undefined,
        elapsed: 0
    };

    this.paused = GetValue(config, 'paused', false);

    this.useFrames = GetValue(config, 'useFrames', false);

    this.autoStart = GetValue(config, 'autoStart', true);

    this.running = this.autoStart;

    this.progress = 0;
    this.totalDuration = 0;

    this.onStart;
    this.onStartScope;
    this.onStartParams;

    this.onUpdate;
    this.onUpdateScope;
    this.onUpdateParams;

    this.onRepeat;
    this.onRepeatScope;
    this.onRepeatParams;

    this.onComplete;
    this.onCompleteScope;
    this.onCompleteParams;

    this.callbackScope;

    this.buildTweenData(config);

};

Tween.prototype.constructor = Tween;

Tween.prototype = {

    //  Move to own functions

    getV: function (obj, key)
    {
        if (obj.hasOwnProperty(key))
        {
            return obj[key];
        }
        else if (this[key])
        {
            return this[key];
        }
    },

    buildTweenData: function (config)
    {
        //  For now let's just assume `config.props` is being used:

        // props: {
        //     x: 400,
        //     y: 300
        // }

        // props: {
        //     x: { value: 400, duration: 2000, ease: 'Power1' },
        //     y: { value: 300, duration: 1000, ease: 'Sine' }
        // }

        for (var key in config.props)
        {
            //  Check it's not a string or number (or function?)
            //  TODO: value might be an Array

            var data;
            var value = config.props[key];

            if (typeof value === 'number')
            {
                data = CloneObject(this.defaultTweenData);

                data.value = value;
            }
            else if (typeof value === 'string')
            {
                //  Do something :)
            }
            else
            {
                data = MergeRight(this.defaultTweenData, config.props[key]);
            }

            //  this.props = [
            //      {
            //          key: 'x',
            //          running: true,
            //          complete: false,
            //          current: 0,
            //          queue: [ TweenData, TweenData, TweenData ],
            //          totalDuration: Number (ms)
            //      }
            //  ]

            //  Convert to ms
            data.duration *= 1000;

            var propertyMarker = CloneObject(this.defaultInstance);

            propertyMarker.key = key;

            //  Adapt these to support array based multi-inserts
            propertyMarker.queue.push(data);
            propertyMarker.totalDuration = data.duration;

            this.props.push(propertyMarker);

            this.totalDuration += propertyMarker.totalDuration;
        }
    },

    update: function (timestep, delta)
    {
        if (!this.running)
        {
            return;
        }

        //  Calculate tweens

        var list = this.props;
        var targets = this.targets;

        //  this.props = [
        //      {
        //          key: 'x',
        //          start: [ Target0 startValue, Target1 startValue, Target2 startValue ],
        //          running: true,
        //          complete: false,
        //          current: 0,
        //          queue: [ TweenData, TweenData, TweenData ],
        //          totalDuration: Number (ms)
        //      }
        //  ]

        for (var i = 0; i < list.length; i++)
        {
            var entry = list[i];

            //  Update TweenData

            if (entry.running)
            {
                // TweenData = {
                //     value: undefined,
                //     progress: 0,
                //     startTime: 0,
                //     ease: this.ease,
                //     duration: this.duration,
                //     yoyo: this.yoyo,
                //     repeat: this.repeat,
                //     loop: this.loop,
                //     delay: this.delay,
                //     startAt: undefined,
                //     elapsed: 0
                // };

                var tweenData = entry.queue[entry.current];

                tweenData.elapsed += delta;

                if (tweenData.elapsed > tweenData.duration)
                {
                    tweenData.elapsed = tweenData.duration;
                }

                //  What % is that?
                tweenData.progress = tweenData.elapsed / tweenData.duration;

                for (var t = 0; t < targets.length; t++)
                {
                    targets[i][entry.key] = tweenData.value;
                }
            }
        }

    },

    setTargets: function (targets)
    {
        if (typeof targets === 'function')
        {
            targets = targets.call();
        }

        if (!Array.isArray(targets))
        {
            targets = [ targets ];
        }

        return targets;
    },

    eventCallback: function (type, callback, params, scope)
    {
        var types = [ 'onStart', 'onUpdate', 'onRepeat', 'onComplete' ];

        if (types.indexOf(type) !== -1)
        {
            this[type] = callback;
            this[type + 'Params'] = params;
            this[type + 'Scope'] = scope;
        }

        return this;
    },

    timeScale: function ()
    {

    }

};

module.exports = Tween;
