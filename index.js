var rawDebug=$('debug')('mvc');
var Busboy = require('busboy');
var debug=function(data){
	rawDebug($('util').inspect(data));
	};

exports.init = function (config)
{
    var controller = function (controllerName, routeValues, filePath)
    {
        var self=this;
		this.asset = function(assetPath)
		{
			assetPath=filePath.replace(/#type#.+$/, 'assets/')+assetPath;
			var file=$('fs').createReadStream(assetPath);
			file.pipe(this.response);

		};
		this.apply = function(action, args)
		{
			debug('applying');
			debug(args);
			var result=action.apply(this, args);
			if(result)
			{
				self.send(result);
			}
		}
        this.redirect = function (redirectUrl)
        {
			if(!redirectUrl)
				return false;
            self.response.redirect(redirectUrl);
        }
        this.redirectTo = function (action, controller)
        {
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
                name = routeValues.action;
            }
            if (name.indexOf('.') > 0)
            {
                extension = name.substr(name.indexOf('.'));
                name = name.substr(0, name.indexOf('.'));
            }
			var baseFile=filePath.replace('#type#', 'views').replace(controllerName+'.js', controllerName  + '/' + name);
            for (var i in config.engines)
            {
                if (extension == null || extension == i)
                {
                    if ($('fs').existsSync(baseFile + i))
                    {
                        debug('view : '+baseFile+ i);
                        switch (config.engines[i])
                        {
                            case "ejs":
                                $('fs').readFile(baseFile + i, function (data)
                                {
                                    $(config.engines[i]).render(data, model, self.send);
                                });
                                break;
                            case "jade":
                                self.send($(config.engines[i]).renderFile(baseFile + i, model));
                                break;
                            case "jazz":
                                $('fs').readFile(baseFile + i, function (data)
                                {
                                    $(config.engines[i]).compile(data).eval(model, self.send);
                                });
                                break;
                            case "bliss":
                                var engine = new ($(config.engines[i]))({ ext: i });
                                self.send(engine.render(baseFile + i, model));
                                break;
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

	function escapeRegExp(str) {
	  return str.replace(/[\-\[\]\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
	}

	var tryShift=function(route, params, paramName, defaults, secondTry)
	{
		var keys=$('router/matcher.js')(route).keys;
		if(route.endsWith('*'))
			keys.push('wildcard');
		debug(keys);
		var paramIndex=keys.indexOf(paramName);
		debug(paramIndex);
		var result=$.extend({}, params);
		if(paramIndex>=0)
		{
			if(typeof(params[keys[keys.length-1]])=='undefined' || keys[keys.length-1]=='wildcard' && typeof(params['wildcard'])=='undefined')
			{
				for(var i=keys.length-1; i>=paramIndex; i--)
				{
					debug(keys[i]);
					result[keys[i] || 'wildcard']=params[keys[i-1]] || defaults[keys[i]];
				}
				result[paramName]=defaults[paramName];
			}
			else if(keys[keys.length-1]=='wildcard' && typeof(params['wildcard'])!='undefined')
			{
				if($.isArray(result.wildcard))
					result.wildcard.unshift(params[keys[keys.length-2]] || defaults.wildcard);
				else if(result.wildcard!= (params[keys[keys.length-2]] || defaults.wildcard))
					result.wildcard=[params[keys[keys.length-2]] || defaults.wildcard, result.wildcard];
				for(var i=keys.length-2; i>=paramIndex; i--)
				{
					debug(keys[i]);
					result[keys[i] || 'wildcard']=params[keys[i-1]] || defaults[keys[i]];
				}
				result[paramName]=defaults[paramName];
			}
			else if(secondTry && paramIndex>0)
			{
				//shift
				var nextValue= params[keys[paramIndex]];
				result[keys[paramIndex]]=params[keys[paramIndex-1]] || defaults[keys[paramIndex]];
				result[keys[paramIndex-1]]=nextValue;
				
				debug('replaced '+keys[paramIndex-1]+' by '+result[keys[paramIndex]])
			}
			else
			{
				//swap
				var nextValue= params[keys[paramIndex]];
				result[keys[paramIndex]]=params[keys[paramIndex+1]] || defaults[keys[paramIndex]];
				result[keys[paramIndex+1] || 'wildcard']=nextValue;

				debug('replaced '+keys[paramIndex-1]+' by '+result[keys[paramIndex]])
			}
		}
		if(typeof(result['*'])!='undefined')
		{
			if($.isArray(result.wildcard))
			{
				if(result.wildcard.indexOf(result['*'])<0)
					result.wildcard.push(result['*']);
			}
			else if(result.wildcard!=result['*'])
				result.wildcard=[result.wildcard, result['*']];
		}
		return result;
	}

    $.each(config.routes, function(i, route)
    {
		// debug(route);
		if(typeof(route)=='string')
			route={route:route};
		else
			route.defaults=$.extend({}, {controller:"home", action:"index"}, route.constraint, route.defaults);
	
		route=$.extend(true, {filePath:"./controllers/{controller}.js", defaults:{controller:"home", action:"index"}}, {defaults:route.constraint}, route);
		route.file={path:route.filePath, keys:$('router/matcher.js')(route.filePath).keys};

        $(function (req, res, next, secondTry)
        {
            secondTry=secondTry || 0;
			var params=$.extend({}, route.defaults, req.params);

			if(req.method.toLowerCase()!=='get' && params.action===route.defaults.action)
			{
				params.action=req.method.toLowerCase();
			}
			
			var filePath=route.file.path;
			$.each(route.file.keys, function(index, key){
				if(key!="#type")
					filePath=filePath.replace(new RegExp('{'+escapeRegExp(key)+'}\\??'), params[key]);
				else
					filePath=filePath.replace(new RegExp('{'+escapeRegExp(key)+'}\\??'), '#type#');
			});

			filePath=filePath.replace(/\/undefined\//g, '/');
			var controllerFilePath=filePath.replace('#type#', 'controllers');
			var invalidConstraints=0;
			if(route.constraint)
			{
				$.each(route.constraint, function(key, value){
					if(params[key]==value)
					{
						debug(params[key]+'!='+value)
						invalidConstraints++;
					}
				});
			}
			if(invalidConstraints>0 || !$('fs').existsSync(controllerFilePath))
			{
				debug(invalidConstraints);
				debug(controllerFilePath);
				debug(secondTry);
				if(params.controller!=route.defaults.controller && secondTry<2)
				{
					debug('controller shift');
					debug(params);
					params=tryShift(route.route, req.params, 'controller', route.defaults, secondTry);
					debug(params);
					req.params=params;
					return arguments.callee(req,res,next, secondTry+1);
				}
				return next();
			}
			
            try
            {
                var self=$(controllerFilePath);
                $.extend(self, { send: res.send, request: req, callback: next, response: res });
                var c = controller.call(self, params.controller, params, filePath);
				debug(filePath);
				debug(params);
                var action = $(controllerFilePath)[params.action];
				var actionBasedOnMethod=false;
                var s = "";
                if (!action)
				{
					action = $(controllerFilePath)[req.method.toLowerCase()];
					actionBasedOnMethod=true;
				}
                if (!action)
				{
					debug('no action found');
                    next();
				}
                else
                {
					if(actionBasedOnMethod)
					{
						debug('action shift');
						params=tryShift(route.route, params, 'action', route.defaults);
						debug(params);
					}
                    var argNames = getParamNames(action);
                    var args = [];
                    var waitingForAsync = 0;
					debug(argNames);
                    $.each(argNames, function(arg, argName)
                    {
                        if (req.query[argName])
                            args[arg] = req.query[argName];
                        if (params[argName])
                            args[arg] = params[argName];
						if (argNames[arg] == 'callback')
							args[arg] = c.send;
                        if (argNames[arg] == 'routeValues')
                            args[arg] = params;
                        if (argNames[arg] == 'body' && typeof(req.headers['content-type'])!='undefined')
                        {
                            console.log(req.headers['content-type']);
                            if(req.headers['content-type'].startsWith('multipart/form-data'))// || req.headers['content-type'].startsWith('application/x-www-form-urlencoded'))
                            {
                                args[arg]={};
                                var multiparty=require('multiparty');
                                console.log(multiparty);
                                var form=new multiparty.Form();
                                console.log('multiparty');
                                form.on('part', function(part){
                                    console.log('part:'+part.name);
                                    var bufs=[];
                                    waitingForAsync++;
                                    part.on('data', function(chunk){ console.log(chunk); bufs.push(chunk) });
                                    part.on('end', function(chunk){ 
                                        args[arg][part.name]=Buffer.concat(bufs);
                                        if(!part.filename)
                                            args[arg][part.name]=args[arg][part.name].toString('utf8');
                                        waitingForAsync--;
                                        if(!waitingForAsync)
                                            c.apply(action, args);
                                    });
                                });
                                form.on('close', function() {
                                    waitingForAsync--;
                                    if(!waitingForAsync)
                                        c.apply(action, args);
                                });
                                waitingForAsync++;
                                form.parse(req);
                            }
                            else
							{
								var bodyParser=require('body/any');
								waitingForAsync++;
								bodyParser(req, function(err, body){
								    if(err)
								        console.log(err);
							        console.log(body);
							        console.log(err);
									args[arg]=body;
									waitingForAsync--;
									if(!waitingForAsync)
										c.apply(action, args);
								});
							}
                        }
                    });

                    if (!waitingForAsync)
					{
                        c.apply(action, args);
					}
                }
            }
            catch (ex)
            {
                if (ex.code == 'MODULE_NOT_FOUND')
                {
                    if (params.action != route.defaults.action)
                    {
                        $.extend(req.params, { controller: req.params.controller + '/' + req.params.action, action: undefined });
                        arguments.callee(req, res, next);
                    }
                    else
					{
						debug('no controller found');
                        next();
					}
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