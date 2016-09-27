var map = L.map('mapid');
var salesArray = null; // hold array of sales objects
var stateCenters = null;
// control variable for handling the mismatch between leaflet drag event and d3 click event on map
// when the user drags the map and releases the mouse, a click event is fired by leaflet that registers
// with our d3 click event handler tied to each state
var clickOK = true;

var locationObj = {
  stateSelected: false, // name of the state clicked on by user or false if no state
  displayState: "remove" // wheter to draw, remove or resize locations
};

// relate a function to be called with the displayState
var locationDispatch = {
  add: addLocations,
  remove: removeLocations,
  resize: resizeLocations
};

/******** Initialize the map ********/

map.options.minZoom = 4;
map.setView([37.8, -96.9], 4);

// add tile layer to map
L.tileLayer( 'http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  subdomains: ['a','b','c']
}).addTo( map );


/******** Set initial d3 variables *******/
var svg = d3.select(map.getPanes().overlayPane).append("svg");
var g   = svg.append("g").attr("class", "leaflet-zoom-hide").attr("id", "mapgroup");

// read state center file to stateCenters variable so we can merge it later with state path data
// we need state centers so we can zoom in on a state correctly when it's selected
readStateCenters();

// there are two events happening when you finish dragging the map
// the leaflet dragend event fires first
// after the leaflet dragend event fires, the d3 click event is fired
// not proud of this solution, but use a control variable to check if the
// click event was fired as the result of a dragend
map.on("dragend", function(e) {
  clickOK = false;
});

map.on("zoomend", function(e) {
  // hide the tooltip if zoom is 7 or more
  d3.select("#stateTooltip").classed("hidden", true);

  // update display state for drawing locations
  setDisplayState();

});

// read the path data for drawing a state
d3.json("us.json", function(error, collection) {
  if (error) throw error;

  // get array of state geojson objects
  var states = collection.features;

  // merge collection data with statecenter data
  stateCenters.forEach(addStateCenters);

  // define function for converting geoJson shape to a pixel shape that can be drawn by d3
  var transform = d3.geoTransform({point: projectPoint}),
      path = d3.geoPath().projection(transform);

  // start binding the state path data to path elements
  var feature = g.selectAll("path")
      .data(states)
      .enter()
      .append("path");

  // use the leaflet viewreset event to tell d3 to redraw
  map.on("viewreset", reset);

  reset();

  // combine sales.csv information with us.json state objects
  function addSalesToState(salesObj){
    var state = salesObj.state;
    for(var i = 0; i < states.length; i++){
      if(states[i].properties.name == state){
        states[i].sales = salesObj
      }
    }
  }

  // combine state centers with state json data so we can control the map zoom
  function addStateCenters(obj){
    var state = obj.state;
    for(var i = 0; i < states.length; i++){
      if(states[i].properties.name == state){
        states[i].center = obj.center;
      }
    }
  }


  // redraw path elements
  function reset() {
    var bounds = path.bounds(collection),
        topLeft = bounds[0],
        bottomRight = bounds[1];

    svg.attr("width", bottomRight[0] - topLeft[0])
      .attr("height", bottomRight[1] - topLeft[1])
      .style("left", topLeft[0] + "px")
      .style("top", topLeft[1] + "px");

    g.attr("transform", "translate(" + -topLeft[0] + "," + -topLeft[1] + ")");

    feature.attr("d", path)
      .attr("class", "statepath")
      .style("fill", styleStateFill)
      .on("click", function(d) {
        // clickOK is true if a drag event did not cause the click
        if(clickOK){
          var newCenter = L.latLng(d.center.lat, d.center.lng);

          // once we know the center, setView(center, zoom) will do the trick
          map.setView(newCenter, 7);

          // change the opacity of the state element back to 0.2
          // otherwise it won't change back until the user hovers off the state
          d3.select(this).style("fill-opacity", 0.2);

          // update locationObj.selectedState if needed
          setSelectedState(d.properties.name);
        }

        // clickOK was just set to false by leaflet zoomend event, flip it back to true
        clickOK = true;
      })
      .on("mouseover", function(d){
        positionStateTooltip( d3.mouse(this) );

        // change opacity if zoom level < 7
        if(map.getZoom() < 7){
          d3.select(this).style("fill-opacity", 0.7);
        }
      })
      .on("mouseout", function(d){
        // hide tooltip
        d3.select("#stateTooltip")
          .classed("hidden", true);

        // change opacity of state back to original
        d3.select(this).style("fill-opacity", 0.2);
      });

    // mousePos = current mouse position, array with x and y values in pixels
    function positionStateTooltip(mousePos){
      // position tooltip only if zoomed out
      if(map.getZoom() < 7) {
        d3.select('#stateTooltip')
          .classed("hidden", false)
          .style("left", mousePos[0] + "px")
          .style("top", mousePos[1] + "px");
      }

    }

    // calculate the fill color the the state path
    function styleStateFill(d) {
      if(map.getZoom() >= 7){
        return "white";
      }

      return "cornflowerblue";
    }

  } // end of reset

  // projection function for converting lat/lng to pixel values
  function projectPoint(x, y) {
    var point = map.latLngToLayerPoint(new L.LatLng(y, x));
    this.stream.point(point.x, point.y);
  }

  function zoomChange(e) {

    var paths = d3.selectAll(".statepath");
    // if zoom level >= 7, remove color styling of states
    // user is zooming in to see store details
    paths.style("fill", "white");
    if(map.getZoom() >= 7){

      paths.style("fill", "white");
    }
    // else
    paths.style("fill", function(d){
      if(d.sales){
        return "green";
      }
      return "black";
    });
  }


}); // end of d3.json call



// convert latitude to pixel value
function projectStateLat(stateObj) {
  var loc = stateObj.coordinates;
  var point = map.latLngToLayerPoint(new L.LatLng(loc[0], loc[1]));

  return point.x + "px";
}

// convert longitude to pixel value
function projectStateLng(stateObj) {
  var loc = stateObj.coordinates;
  var point = map.latLngToLayerPoint(new L.LatLng(loc[0], loc[1]));

  return point.y + "px";
}

function readSalesData() {
  // read the csv file of sales data so we can merge it with the state path json
  // salesArray is array of objects, one per line in the csv
  d3.csv("sales.csv", parseRow, function(data){
    salesArray = data;
  });

}

function readStateCenters() {
  // read the csv file of state centers so we can merge it with the state path json
  // we need state center data so we zoom the map to the center of a state
  d3.csv("statecenters.csv", parseStateRow, function(data){
    stateCenters = data;
  });

}

// custom parser for reading csv file
// convert sales data to floats
function parseRow(d) {
  return {
    state: d.state,
    transactions: +d.transactions,
    totalSales: +d.totalSales,
    salesVolume: +d.salesVolume,
    avgBasket: +d.avgBasket
  };
}

// custom parser for reading csv state center file
function parseStateRow(d) {
  return {
    state: d.state,
    center: {
      lat: +d.lat,
      lng: +d.lng
    }
  }
};

/******* Functions that control location display ********/
function setSelectedState(state) {
  // if the current display state is remove, the user selected a state
  // to zoom on and we need to set locationObj.selectedState
  if (locationObj.displayState == 'remove') {
    locationObj.stateSelected = state;
  }
}

function setDisplayState() {
  var displayState = locationObj.displayState;
  var stateSelected = locationObj.stateSelected;
  var zoomLevel = map.getZoom();

  /* Transition rules
     1) remove & stateSelected & zoom = 7 ==> addLocations, change displayState to add
     2) remove & !stateSelected ==> do nothing
     2) add & zoom > 7 ==> resizeLocations, change displayState to resize
     3) add & zoom < 7 ==> removeLocations, change displayState to remove
     4) resize & zoom >= 7 ==> resizeLocations
     4) resize & zoom < 7 ==> removeLocations, change displayState to remove
  */

  if (displayState == 'remove' && stateSelected && zoomLevel == 7) {
    locationObj.displayState = 'add';
    addLocations();
  } else if (displayState == 'add' && zoomLevel > 7) {
    locationObj.displayState = 'resize';
    resizeLocations();
  } else if (displayState == 'add' && zoomLevel < 7) {
    locationObj.displayState = 'remove';
    locationObj.stateSelected = false;
    removeLocations();
  } else if (displayState == 'resize' && zoomLevel >= 7) {
    resizeLocations();
  } else if(displayState =='resize' && zoomLevel < 7) {
    locationObj.displayState = 'remove';
    locationObj.stateSelected = false;
    removeLocations();
  } else {
    // other combinations end up in here, nothing to do with them
  }

}

function addLocations() {
  d3.json("locations.json", function(error, data){
    if(error) throw error;

    var locations = data.locations;
    // create a group for us to append the locations to
    var locationsGroup = d3.select("#mapgroup").append("g").attr("id", "locationsgroup");

    var circles = locationsGroup.selectAll("circle")
        .data(locations)
        .enter()
        .append("circle");

    circles.attr("cx", projectStateLat)
      .attr("cy", projectStateLng)
      .attr("r", "0px")
      .transition()
      .duration(500)
      .attr("r", "10px")
      .style("fill", "red")
      .style("fill-opacity", 0.8)
      .style("stroke", "gray")
      .style("stroke-width", "1px");

    circles.on("mouseover", function(){
      positionLocationTooltip( d3.mouse(this) );
    })
      .on("mouseout",function() {
        d3.select("#locationTooltip").classed("hidden", true);
      });
  });
}

function removeLocations() {
  d3.selectAll("#locationsgroup circle")
    .data([]).exit()
    .remove();
}

function resizeLocations() {
  d3.selectAll("#locationsgroup circle")
    .attr("r", "0px")
    .style("fill-opacity", 0)
    .style("stroke", "gray")
    .style("stroke-width", "1px")
    .attr("cx", projectStateLat)
    .attr("cy", projectStateLng)
    .transition()
    .duration(500)
    .attr("r", "10px")
    .style("fill-opacity", 0.8)
    .style("stroke", "gray")
    .style("stroke-width", "1px");
}

// mousePos = current mouse position, array with x and y values in pixels
function positionLocationTooltip(mousePos){
  // position tooltip only if zoomed out
  if(map.getZoom() >= 7) {
    d3.select('#locationTooltip')
      .classed("hidden", false)
      .style("left", mousePos[0] + "px")
      .style("top", mousePos[1] + "px");
  }

}
