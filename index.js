var rawDebug=$('debug')('mvc');
var debug=function(data){
	rawDebug($('util').inspect(data));
	};

exports.init = function (config)
{
    var controller = function (controllerName, routeValues)
    {
        this.redirect = function (redirectUrl)
        {
            if (!redirectUrl)
                return false;
            this.response.setHeader("Location", redirectUrl);
            this.send(302);
            return true;
        }
        this.redirectTo = function (action, controller)
        {
            var self = this;
            for (var index in config.routes)
            {
                var matcher = $('router/matcher.js')(config.routes[index]);
                if (matcher.keys.indexOf('controller') >= 0 && matcher.keys.indexOf('action') >= 0)
                    if (self.redirect($('router/formatter.js')(config.routes[index])({ controller: controller, action: action })))
                        return;
            }
        }

        this.view = function (name, model)
        {
            var extension = null;
            if (typeof (name) != 'string')
            {
                model = name;
                name = 'index';
            }
            if (name.indexOf('.') > 0)
            {
                extension = name.substr(name.indexOf('.'));
                name = name.substr(0, name.indexOf('.'));
            }
            var self = this;
            for (var i in config.engines)
            {
                if (extension == null || extension == i)
                {
                    if ($('fs').existsSync('./views/' + controllerName + '/' + name + i))
                    {
                        debug('view : ./views/' + controllerName + '/' + name + i);
                        switch (config.engines[i])
                        {
                            case "ejs":
                                $('fs').readFile('./views/' + controllerName + '/' + name + i, function (data)
                                {
                                    $(config.engines[i]).render(data, model, self.send);
                                });
                            case "jade":
                                self.send($(config.engines[i]).renderFile('./views/' + controllerName + '/' + name, model));
                            case "jazz":
                                $('fs').readFile('./views/' + controllerName + '/' + name + i, function (data)
                                {
                                    $(config.engines[i]).compile(data).eval(model, self.send);
                                });
                            case "bliss":
                                var engine = new ($(config.engines[i]))({ ext: i });
                                self.send(engine.render('./views/' + controllerName + '/' + name + i, model));
                        }
                        return;
                    }
                }
            }
            self.send(404, 'Not found');
        };
        return this;
    }

    var STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
    function getParamNames(func)
    {
        var fnStr = func.toString().replace(STRIP_COMMENTS, '')
        var result = fnStr.slice(fnStr.indexOf('(') + 1, fnStr.indexOf(')')).match(/([^\s,]+)/g)
        if (result === null)
            result = []
        return result
    };
	
	var tryShift=function(route, params, paramName, defaults)
	{
		var keys=$('router/matcher.js')(route).keys;
		var paramIndex=keys.indexOf(paramName);
		var result=$.extend({}, params);
		if(paramIndex>=0)
		{
			debug(params);
			if(typeof(params[keys[keys.length-1]])=='undefined')
			{
				for(var i=keys.length-1; i>=paramIndex; i--)
				{
					result[keys[i]]=params[keys[i-1]] || defaults[keys[i]];
				}
				result[paramName]=defaults[paramName];
			}
			else
			{
				//swap
				var nextValue= params[keys[paramIndex]];
				result[keys[paramIndex]]=params[keys[paramIndex+1]];
				result[keys[paramIndex+1]]=nextValue;
			}
		}
		return result;
	}

    $.each(config.routes, function(i, route)
    {
		// debug(route);
		if(typeof(route)=='string')
			route={route:route, defaults:{controller:"home", action:"index"}};
		else
			route.defaults=$.extend({}, {controller:"home", action:"index"}, route.constraint, route.defaults);
	
        $(function (req, res, next)
        {
			var params=$.extend({},req.params);
		
            if (typeof (params.controller) == 'undefined')
                params.controller = route.defaults.controller;
            if (typeof (params.action) == 'undefined')
                params.action = route.defaults.action;
				
			debug(params);
			if(typeof(route.constraint)!='undefined')
			{
				var invalidConstraints=0;
				$.each(route.constraint, function(key, value){
					if(params[key]!=value)
					{
						debug(params[key]+'!='+value)
						invalidConstraints++;
					}
				});
				if(invalidConstraints>0)
				{
					if(params.controller!=route.defaults.controller)
					{
						debug('controller shift');
						debug(params);
						params=tryShift(route.route, req.params, 'controller', route.defaults);
						debug(params);
						$.extend(req.params, params);
						return arguments.callee(req,res,next);
					}
					return next();
				}
			}

            try
            {
                var c = controller.call({ send: res.send, request: req, next: next, response: res }, params.controller);
                var action = $('./controllers/' + params.controller)[params.action];
				var actionBasedOnMethod=false;
                var s = "";
                if (!action)
				{
					action = $('./controllers/' + params.controller)[req.method.toLowerCase()];
					actionBasedOnMethod=true;
				}
                if (!action)
                    res.send(404, 'Not found');
                else
                {
					if(actionBasedOnMethod)
					{
						debug('action shift');
						debug(params);
						params=tryShift(route.route, params, 'action', {action:req.method.toLowerCase()});
						debug(params);
					}
                    var argNames = getParamNames(action);
                    var args = [];
                    var waitingForAsync = 0;
					// console.log(argNames);
                    $.each(argNames, function(arg)
                    {
                        if (req.query[argNames[arg]])
                            args[arg] = req.query[argNames[arg]];
                        if (params[argNames[arg]])
                            args[arg] = params[argNames[arg]];
                        if (argNames[arg] == 'routeValues')
                            args[arg] = params;
                        if (argNames[arg] == 'body')
                        {
                            waitingForAsync++;
                            args[arg] = "";
                            req.on('data', function (chunk)
                            {
                                args[arg] += chunk;
								// console.log(chunk);
                            });
                            req.on('end', function ()
                            {
								console.log('end');
                                if (req.headers['content-type'] == 'application/json')
                                    args[arg] = JSON.parse(args[arg]);
                                waitingForAsync--;
								// console.log(params);
                                if (!waitingForAsync)
                                    action.apply(c, args);
                            });
                        }
                    });
                    if (!waitingForAsync)
                        action.apply(c, args);
                }
            }
            catch (ex)
            {
                if (ex.code == 'MODULE_NOT_FOUND')
                {
                    next();
                }
                else
                {
                    console.log(ex);
                    next(ex);
                }
            }

        }).all(route.route);
    });
}
