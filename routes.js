exports = module.exports = function (app) {

  // server side rendering routes used to dynamically update meta tags for description and title based on url. 
  app.get('/', require('./serverSideRendering').init)
  app.get('/about', require('./serverSideRendering').init)
  app.get('/work', require('./serverSideRendering').init)
  app.get('/contact', require('./serverSideRendering').init)
  app.get('/admin', require('./serverSideRendering').init)
  app.get('/adminPanel', require('./serverSideRendering').init)
};