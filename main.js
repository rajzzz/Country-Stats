import { countryNamesByCode } from './countryData.js';

// Global variables
let scene, camera, renderer, raycaster, mouse, countryNameDisplay;
let globe, globeGroup;
let countries = {};
let hoveredCountry = null;
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };
let globeRotation = { x: 0, y: 0 };
let minZoom = 150;
let maxZoom = 400;
let currentZoom = 200;
let isAutoRotating = true;
const autoRotationSpeed = 0.001; // Very slow rotation speed

// Add object pooling for geometries and materials
let geometryPool = {
    line: new THREE.BufferGeometry(),
    shape: new THREE.BufferGeometry()
};
let materialPool = {
    line: new THREE.LineBasicMaterial({ color: 0x17202a, linewidth: 1 }),
    shape: new THREE.MeshPhongMaterial({
        color: 0xA9CCE3,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        flatShading: true
    })
};

// Initialize the scene
function init() {
    // Set up scene
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = currentZoom;
    
    // Set up renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.getElementById('container').appendChild(renderer.domElement);
    
    // Set up raycaster for mouse interaction
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    
    // Reference to country name display
    countryNameDisplay = document.getElementById('country-name');
    
    // Create a group for the globe and countries
    globeGroup = new THREE.Group();
    scene.add(globeGroup);
    
    // Create the globe
    createGlobe();
    
    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.55);
    directionalLight.position.set(5, 3, 5);
    scene.add(directionalLight);
    
    // Add event listeners
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    renderer.domElement.addEventListener('wheel', onMouseWheel);
    
    // Start animation
    animate();
}

// Create the globe with country outlines
function createGlobe() {
    const radius = 100;
    const globeGeometry = new THREE.SphereGeometry(radius, 64, 64);
    const globeMaterial = new THREE.MeshPhongMaterial({
        color: 0xfef9e7 ,
        transparent: false,
        opacity: 1
    });
    
    globe = new THREE.Mesh(globeGeometry, globeMaterial);
    globeGroup.add(globe);
    
    // Load world data
    fetch('https://raw.githubusercontent.com/mbostock/topojson/v1.6.19/examples/world-50m.json')
        .then(response => response.json())
        .then(data => {
            const countries = topojson.feature(data, data.objects.countries);
            // Map country names using the countryNamesByCode object
            countries.features.forEach(feature => {
                feature.properties = feature.properties || {};
                feature.properties.name = countryNamesByCode[feature.id] || `Country ${feature.id}`;
            });
            createCountryOutlines(countries, radius);
        })
        .catch(error => {
            console.error('Error loading data:', error);
            createSimulatedGlobe(radius);
        });
}

// Create a simulated globe with fake continents in case the real data fails to load
function createSimulatedGlobe(radius) {
    // Create some simple continent shapes
    const continentShapes = [
        { lat: 40, lng: -100, width: 60, height: 30, name: "North America" },
        { lat: 10, lng: -60, width: 40, height: 40, name: "South America" },
        { lat: 50, lng: 10, width: 60, height: 40, name: "Europe" },
        { lat: 10, lng: 20, width: 70, height: 60, name: "Africa" },
        { lat: 40, lng: 100, width: 70, height: 50, name: "Asia" },
        { lat: -25, lng: 135, width: 40, height: 30, name: "Australia" },
    ];
    
    continentShapes.forEach((shape, i) => {
        const material = new THREE.LineBasicMaterial({ 
            color: 0xA9CCE3,
            linewidth: 1
        });
        
        // Convert to 3D coordinates and create line segments
        const shape3D = createContinentMesh(shape, radius);
        const continent = new THREE.Line(shape3D, material);
        continent.userData = { name: shape.name, originalColor: 0xA9CCE3 };
        countries[`continent-${i}`] = continent;
        globeGroup.add(continent);  // Add to group instead of scene
    });
}

// Create a simple continent shape from lat/lng/width/height
function createContinentMesh({ lat, lng, width, height }, radius) {
    const points = [];
    const geometry = new THREE.BufferGeometry();
    
    // Create a rough rectangular shape on the sphere surface
    const centerX = lng;
    const centerY = lat;
    
    // Rectangle points
    const corners = [
        [centerX - width/2, centerY - height/2],
        [centerX + width/2, centerY - height/2],
        [centerX + width/2, centerY + height/2],
        [centerX - width/2, centerY + height/2],
        [centerX - width/2, centerY - height/2] // Close the loop
    ];
    
    corners.forEach(corner => {
        const [lng, lat] = corner;
        const point = latLngToVector3(lat, lng, radius);
        points.push(point);
    });
    
    geometry.setFromPoints(points);
    return geometry;
}

// Create country outlines from GeoJSON
function createCountryOutlines(geoJson, radius) {
    geoJson.features.forEach(feature => {
        const countryName = feature.properties.name || 'Unknown Country';
        
        const countryGroup = new THREE.Group();
        countryGroup.userData = { 
            name: countryName,
            originalColor: 0x17202a, 
            id: feature.id,
            parts: []
        };
        
        if (feature.geometry.type === 'Polygon') {
            createCountryPart(feature.geometry.coordinates, radius, countryGroup);
        } else if (feature.geometry.type === 'MultiPolygon') {
            feature.geometry.coordinates.forEach(poly => {
                createCountryPart(poly, radius, countryGroup);
            });
        }
        
        countries[feature.id] = countryGroup;
        globeGroup.add(countryGroup);
    });
}

function createCountryPart(coords, radius, countryGroup) {
    const points = [];
    // Implement basic LOD - reduce points when further away
    const skipPoints = camera.position.z > 300 ? 2 : 1;
    
    for (let i = 0; i < coords[0].length; i += skipPoints) {
        const coord = coords[0][i];
        const [lng, lat] = coord;
        const point = latLngToVector3(lat, lng, radius);
        points.push(point);
    }
    
    // Reuse geometry from pool
    const lineGeometry = geometryPool.line.clone();
    lineGeometry.setFromPoints(points);
    
    // Reuse material from pool
    const countryLine = new THREE.Line(lineGeometry, materialPool.line.clone());
    
    // Create shape for country area
    const vertices = [];
    const triangles = [];
    const center = new THREE.Vector3(0, 0, 0);
    
    points.forEach(point => center.add(point));
    center.divideScalar(points.length);
    center.normalize().multiplyScalar(radius);
    
    for (let i = 0; i < points.length - 1; i++) {
        vertices.push(
            points[i].x, points[i].y, points[i].z,
            points[i + 1].x, points[i + 1].y, points[i + 1].z,
            center.x, center.y, center.z
        );
        triangles.push(i * 3, i * 3 + 1, i * 3 + 2);
    }
    
    const shapeGeometry = geometryPool.shape.clone();
    shapeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    shapeGeometry.setIndex(triangles);
    shapeGeometry.computeVertexNormals();
    shapeGeometry.computeBoundingSphere(); // Add bounding sphere for frustum culling
    
    const countryShape = new THREE.Mesh(shapeGeometry, materialPool.shape.clone());
    
    // Enable frustum culling
    countryLine.frustumCulled = true;
    countryShape.frustumCulled = true;
    
    countryGroup.add(countryLine);
    countryGroup.add(countryShape);
    countryGroup.userData.parts.push({
        line: countryLine,
        shape: countryShape
    });
}

// Convert latitude and longitude to 3D vector
function latLngToVector3(lat, lng, radius) {
    const phi = (90 - lat) * Math.PI / 180;
    const theta = (lng + 180) * Math.PI / 180;
    
    const x = -radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.cos(phi);
    const z = radius * Math.sin(phi) * Math.sin(theta);
    
    return new THREE.Vector3(x, y, z);
}

// Throttle function to limit how often a function can be called
function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// Handle mouse movement for raycasting
function onMouseMove(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    if (isDragging) {
        const deltaMove = {
            x: event.clientX - previousMousePosition.x,
            y: event.clientY - previousMousePosition.y
        };

        globeRotation.x += deltaMove.y * 0.005;
        globeRotation.y += deltaMove.x * 0.005;

        // Limit vertical rotation to avoid flipping
        globeRotation.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, globeRotation.x));

        previousMousePosition = {
            x: event.clientX,
            y: event.clientY
        };
    }
    
    // Throttle the intersection checking for better performance
    throttledCheckIntersections();
}

// Throttled version of checkIntersections
const throttledCheckIntersections = throttle(checkIntersections, 50);

// Check for intersections with mouse and countries
function checkIntersections() {
    raycaster.setFromCamera(mouse, camera);
    
    // Reset previously hovered country
    if (hoveredCountry) {
        const country = countries[hoveredCountry];
        if (country) {
            if (country.userData.parts) {
                country.userData.parts.forEach(part => {
                    part.line.material.color.setHex(country.userData.originalColor);
                    //part.shape.material.color.setHex(country.userData.originalColor);
                    part.shape.material.opacity = 0;
                    part.line.material.needsUpdate = true;
                    part.shape.material.needsUpdate = true;
                });
            } else {
                country.material.color.setHex(country.userData.originalColor);
                country.material.needsUpdate = true;
            }
        }
        hoveredCountry = null;
        countryNameDisplay.textContent = '';
    }

    // Get all meshes for intersection testing
    const allMeshes = [];
    Object.values(countries).forEach(country => {
        if (country.userData.parts) {
            country.userData.parts.forEach(part => {
                // Include both the line and shape for intersection testing
                allMeshes.push(part.line);
                allMeshes.push(part.shape);
            });
        } else {
            allMeshes.push(country);
        }
    });
    
    const intersects = raycaster.intersectObjects(allMeshes);
    
    if (intersects.length > 0) {
        const intersectedObject = intersects[0].object;
        const countryGroup = intersectedObject.parent;
        
        hoveredCountry = countryGroup.userData.id;
        const highlightColor = 0xFFFFFF;
        const linehighlightColor = 0x17202a;
        
        if (countryGroup.userData.parts) {
            countryGroup.userData.parts.forEach(part => {
                part.line.material.color.setHex(linehighlightColor);
                part.shape.material.color.setHex(highlightColor);
                part.shape.material.opacity = 0.6;  // Increased opacity for better visibility
                part.line.material.needsUpdate = true;
                part.shape.material.needsUpdate = true;
            });
        } else {
            // Handle the case for simulated globe where countries are single lines
            countryGroup.material.color.setHex(highlightColor);
            countryGroup.material.needsUpdate = true;
        }
        
        countryNameDisplay.textContent = countryGroup.userData.name;
    }
}

// Handle window resizing
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Handle mouse down event
function onMouseDown(event) {
    isDragging = true;
    isAutoRotating = false;  // Stop auto-rotation when user interacts
    previousMousePosition = {
        x: event.clientX,
        y: event.clientY
    };
}

// Handle mouse up event
function onMouseUp() {
    isDragging = false;
    // Resume auto-rotation after a short delay
    setTimeout(() => {
        isAutoRotating = true;
    }, 1500);
}

// Add new zoom function
function onMouseWheel(event) {
    event.preventDefault();
    isAutoRotating = false;  // Stop auto-rotation during zoom
    
    const zoomSpeed = 15;
    const delta = -Math.sign(event.deltaY) * zoomSpeed;
    
    currentZoom = camera.position.z - delta;
    currentZoom = Math.max(minZoom, Math.min(maxZoom, currentZoom));
    
    camera.position.z = currentZoom;

    // Resume auto-rotation after a short delay
    clearTimeout(this.wheelTimeout);
    this.wheelTimeout = setTimeout(() => {
        isAutoRotating = true;
    }, 1500);
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    if (isAutoRotating) {
        globeRotation.y += autoRotationSpeed;
    }
    
    // Only update rotation if it changed
    if (globeGroup.rotation.x !== globeRotation.x || 
        globeGroup.rotation.y !== globeRotation.y) {
        globeGroup.rotation.x = globeRotation.x;
        globeGroup.rotation.y = globeRotation.y;
    }
    
    renderer.render(scene, camera);
}

// Start the application
init();