/* global THREE, topojson */
import { countryNamesByCode } from './countryData.js';
import { fetchCountryStats } from './api.js';
import { initErrorHandling, sanitizeString } from './js/errorHandler.js';

// Global variables
let scene, camera, renderer, raycaster, mouse, countryNameDisplay;
let globe, globeGroup;
let countries = {};
let hoveredCountry = null;
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };
let globeRotation = { x: 0, y: 0 };
let minZoom = 110;
let maxZoom = 400;
let currentZoom = 200;
let isAutoRotating = true;
const autoRotationSpeed = 0.0005; // Very slow rotation speed

// Material pool for better performance
const materialPool = {
    line: new THREE.LineBasicMaterial({ color: 0x17202a, linewidth: 1 }),
    shape: new THREE.MeshPhongMaterial({
        color: 0xA9CCE3,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        flatShading: true
    })
};

// Add these to global variables
let lastRotation = { x: 0, y: 0 };
let targetRotation = { x: 0, y: 0 };
const INTERPOLATION_FACTOR = 0.1;

// Initialize error handling
initErrorHandling();

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
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.45);
    directionalLight.position.set(5, 3, 5);
    scene.add(directionalLight);
    
    // Add event listeners
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    renderer.domElement.addEventListener('wheel', onMouseWheel);
    renderer.domElement.addEventListener('dblclick', onDoubleClick);
    
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
    if (!coords || !coords[0] || coords[0].length < 3) {
        return; // Skip invalid geometries
    }

    const points = [];
    const distance = camera.position.z;
    const skipPoints = Math.max(1, Math.floor(distance / 100));
    
    // Decimate geometry based on distance
    for (let i = 0; i < coords[0].length; i += skipPoints) {
        const coord = coords[0][i];
        if (Array.isArray(coord) && coord.length >= 2) {
            const [lng, lat] = coord;
            const point = latLngToVector3(lat, lng, radius);
            points.push(point);
        }
    }

    if (points.length < 3) {
        return; // Need at least 3 points for a valid shape
    }

    // Create line geometry
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flatMap(p => [p.x, p.y, p.z]), 3));
    lineGeometry.computeBoundingSphere();
    
    const countryLine = new THREE.Line(lineGeometry, materialPool.line.clone());
    
    // Create shape geometry
    const shapeGeometry = new THREE.BufferGeometry();
    const vertices = [];
    const uvs = [];
    
    const center = new THREE.Vector3();
    points.forEach(p => center.add(p));
    center.divideScalar(points.length);
    center.normalize().multiplyScalar(radius);

    // Create triangle fan around center point
    for (let i = 0; i < points.length - 1; i++) {
        vertices.push(
            ...center.toArray(),
            ...points[i].toArray(),
            ...points[i + 1].toArray()
        );
        
        uvs.push(0, 0, 0, 1, 1, 1);
    }
    
    // Close the shape by connecting last point to first point
    vertices.push(
        ...center.toArray(),
        ...points[points.length - 1].toArray(),
        ...points[0].toArray()
    );
    uvs.push(0, 0, 0, 1, 1, 1);
    
    shapeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    shapeGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    shapeGeometry.computeVertexNormals();
    shapeGeometry.computeBoundingSphere();
    
    const countryShape = new THREE.Mesh(shapeGeometry, materialPool.shape.clone());
    
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

// Create a simulated globe with basic shapes if data loading fails
function createSimulatedGlobe(radius) {
    const basicShape = new THREE.SphereGeometry(radius, 32, 32);
    const basicMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xA9CCE3,
        wireframe: true 
    });
    const basicGlobe = new THREE.Mesh(basicShape, basicMaterial);
    globeGroup.add(basicGlobe);
}

// Throttle function to limit how often a function can be called
function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => { inThrottle = false; }, limit);
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

        targetRotation.x += deltaMove.y * 0.005;
        targetRotation.y += deltaMove.x * 0.005;

        // Limit vertical rotation to avoid flipping
        targetRotation.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, targetRotation.x));

        previousMousePosition = {
            x: event.clientX,
            y: event.clientY
        };
    }
    
    // Reduce raycasting frequency
    if (!isDragging) {
        throttledCheckIntersections();
    }
}

// Throttled version of checkIntersections
const throttledCheckIntersections = throttle(checkIntersections, 100);

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
    setTimeout(() => {
        isAutoRotating = true;
    }, 1000);
}

// Handle mouse wheel event
function onMouseWheel(e) {
    e.preventDefault();
    isAutoRotating = false;  // Stop auto-rotation during zoom
    
    const zoomSpeed = 15;
    const delta = -Math.sign(e.deltaY) * zoomSpeed;
    
    currentZoom = camera.position.z - delta;
    currentZoom = Math.max(minZoom, Math.min(maxZoom, currentZoom));
    
    camera.position.z = currentZoom;

    // Resume auto-rotation after a short delay
    clearTimeout(this.wheelTimeout);
    this.wheelTimeout = setTimeout(() => {
        isAutoRotating = true;
    }, 500);
}

// Handle double-click event
function onDoubleClick() {
    raycaster.setFromCamera(mouse, camera);

    // Get all meshes for intersection testing
    const allMeshes = [];
    Object.values(countries).forEach(country => {
        if (country.userData.parts) {
            country.userData.parts.forEach(part => {
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

        // Fetch and display stats for the double-clicked country
        const countryName = countryGroup.userData.name;
        fetchCountryStats(countryName).then(stats => {
            if (stats) {
                displayCountryStats(countryName, stats);
            } else {
                console.error(`No stats available for ${countryName}`);
            }
        });
    }
}

function displayCountryStats(countryName, stats) {
    const statsContainer = document.getElementById('country-stats');
    if (!statsContainer) {
        console.error("Stats container not found in the DOM.");
        return;
    }

    // Sanitize inputs
    const sanitizedCountryName = sanitizeString(countryName);
    
    // Clear previous stats
    statsContainer.innerHTML = `<h2>${sanitizedCountryName}</h2>`;
    if (stats) {
        // Sanitize all string inputs
        const currencies = stats.currencies ? Object.values(stats.currencies)
            .map(c => `${sanitizeString(c.name)} (${sanitizeString(c.symbol || '')})`)
            .join(', ') : 'N/A';
        
        // Format population density
        const populationDensity = stats.area ? (stats.population / stats.area).toFixed(2) : 'N/A';
        
        // Format car info
        const carInfo = stats.car ? `${sanitizeString(stats.car.side)} side, ${stats.car.signs ? stats.car.signs.map(sanitizeString).join(', ') : 'N/A'}` : 'N/A';
        
        // Get start of week
        const startOfWeek = stats.startOfWeek ? sanitizeString(stats.startOfWeek.charAt(0).toUpperCase() + stats.startOfWeek.slice(1)) : 'N/A';

        // Format GINI index - get the most recent year's value
        let giniIndex = 'N/A';
        if (stats.gini && typeof stats.gini === 'object') {
            const giniYears = Object.keys(stats.gini).sort((a, b) => b - a); // Sort years descending
            if (giniYears.length > 0) {
                const latestYear = giniYears[0];
                giniIndex = `${stats.gini[latestYear].toFixed(1)}% (${latestYear})`;
            }
        }
        
        statsContainer.innerHTML += `
            <h3>Population & Demographics</h3>
            <p><strong>Population:</strong> ${stats.population.toLocaleString()}</p>
            <p><strong>Density:</strong> ${populationDensity} people/km²</p>
            ${stats.demonyms ? `<p><strong>Demonym:</strong> ${sanitizeString(stats.demonyms.eng.m)}/${sanitizeString(stats.demonyms.eng.f)}</p>` : ''}
            <p><strong>Languages:</strong> ${stats.languages ? Object.values(stats.languages).map(sanitizeString).join(', ') : 'N/A'}</p>
            
            <h3>Geography & Administration</h3>
            <p><strong>Region:</strong> ${sanitizeString(stats.region)}</p>
            <p><strong>Subregion:</strong> ${sanitizeString(stats.subregion || 'N/A')}</p>
            <p><strong>Capital:</strong> ${sanitizeString(stats.capital ? stats.capital[0] : 'N/A')}</p>
            <p><strong>Area:</strong> ${stats.area.toLocaleString()} km²</p>
            ${stats.borders ? `<p><strong>Borders:</strong> ${stats.borders.map(sanitizeString).join(', ')}</p>` : ''}
            
            <h3>Economic & Social</h3>
            <p><strong>Currency:</strong> ${currencies}</p>
            <p><strong>GINI Index:</strong> ${giniIndex}</p>
            <p><strong>UN Member:</strong> ${stats.unMember ? 'Yes' : 'No'}</p>
            <p><strong>Independent:</strong> ${stats.independent ? 'Yes' : 'No'}</p>
            
            <h3>Additional Info</h3>
            <p><strong>Timezones:</strong> ${stats.timezones.map(sanitizeString).join(', ')}</p>
            <p><strong>Driving:</strong> ${carInfo}</p>
            <p><strong>Week starts:</strong> ${startOfWeek}</p>
            ${stats.tld ? `<p><strong>Domain:</strong> ${stats.tld.map(sanitizeString).join(', ')}</p>` : ''}
            ${stats.idd?.root ? `<p><strong>Phone Code:</strong> ${sanitizeString(stats.idd.root)}${sanitizeString(stats.idd.suffixes?.[0] || '')}</p>` : ''}
        `;
    } else {
        statsContainer.innerHTML += "<p>No data available.</p>";
    }
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    if (isAutoRotating) {
        targetRotation.y += autoRotationSpeed;
    }
    
    // Smooth interpolation between current and target rotation
    globeRotation.x += (targetRotation.x - globeRotation.x) * INTERPOLATION_FACTOR;
    globeRotation.y += (targetRotation.y - globeRotation.y) * INTERPOLATION_FACTOR;
    
    // Only update if rotation changed significantly
    if (Math.abs(lastRotation.x - globeRotation.x) > 0.0001 || 
        Math.abs(lastRotation.y - globeRotation.y) > 0.0001) {
        globeGroup.rotation.x = globeRotation.x;
        globeGroup.rotation.y = globeRotation.y;
        
        lastRotation.x = globeRotation.x;
        lastRotation.y = globeRotation.y;
    }
    
    renderer.render(scene, camera);
}

// Start the application
init();