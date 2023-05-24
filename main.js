import * as THREE from "three";
import WebGL from "three/addons/capabilities/WebGL.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GUI } from "dat.gui";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as CANNON from "cannon-es";
// SETUP
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 1, 1);
const renderer = new THREE.WebGL1Renderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

const control = new OrbitControls(camera, renderer.domElement);
control.enableDamping = true;
control.minDistance = 5;
control.maxDistance = 15;
control.enablePan = false;
control.maxPolarAngle = Math.PI / 2 - 0.05;
control.update();

//Ambient
const light = new THREE.AmbientLight("#FFFFFF"); // soft white light
scene.add(light);

// SPOT LIGHT
const spotLight = new THREE.SpotLight(0xffffff);
scene.add(spotLight);
spotLight.position.set(0, 8, 2);
spotLight.intensity = 1.2;
spotLight.angle = 0.45;
spotLight.penumbra = 0.3;
spotLight.castShadow = true;

spotLight.shadow.mapSize.width = 1024;
spotLight.shadow.mapSize.height = 1024;
spotLight.shadow.camera.near = 5;
spotLight.shadow.camera.far = 10;
spotLight.shadow.focus = 1;

//Sphere
const sphereGeo = new THREE.SphereGeometry(2);
const sphereMat = new THREE.MeshBasicMaterial({
  color: 0xff0000,
  wireframe: true,
});
const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
scene.add(sphereMesh);

//Plane
const planeGeo = new THREE.PlaneGeometry(10, 10);
const planeMat = new THREE.MeshPhongMaterial({
  color: 0xffffff,
});
const plane = new THREE.Mesh(planeGeo, planeMat);
scene.add(plane);

scene.add(new THREE.GridHelper(10, 10));

//Cube
const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshBasicMaterial({
  color: 808080,
  wireframe: true,
});
const cube = new THREE.Mesh(geometry, material);
scene.add(cube);

//GRAVITY CANNON
const world = new CANNON.World({
  gravity: new CANNON.Vec3(0, -9.81, 0),
});

const timeStep = 1 / 60;

const groundPhysMat = new CANNON.Material();

const planeBody = new CANNON.Body({
  // shape: new CANNON.Plane(),
  shape: new CANNON.Box(new CANNON.Vec3(5, 5, 0.1)),
  type: CANNON.Body.STATIC,
  material: groundPhysMat,
  // mass: 10,
});
world.addBody(planeBody);
planeBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);

const boxBody = new CANNON.Body({
  mass: 1,
  shape: new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5)),
  position: new CANNON.Vec3(4, 20, 0),
});
world.addBody(boxBody);

const boxdPhysMat = new CANNON.Material();

boxBody.angularVelocity.set(0, 10, 0);
boxBody.angularDamping = 0.5;

const groundBoxContactMat = new CANNON.ContactMaterial(
  groundPhysMat,
  boxdPhysMat,
  { friction: 0.04 }
);
world.addContactMaterial(groundBoxContactMat);

const spherePhysMat = new CANNON.Material();

const sphereBody = new CANNON.Body({
  mass: 10,
  shape: new CANNON.Sphere(2),
  position: new CANNON.Vec3(0, 15, 0),
  material: spherePhysMat,
});
world.addBody(sphereBody);

sphereBody.linearDamping = 0.31;

const groundSphereContactMat = new CANNON.ContactMaterial(
  groundPhysMat,
  spherePhysMat,
  { restitution: 0.9 }
);
world.addContactMaterial(groundSphereContactMat);

// RENDER MODELS
const gltfLoader = new GLTFLoader();
let characterControl;

gltfLoader.load("./assets/data/Soldier.glb", (gltf) => {
  const model = gltf.scene;
  model.traverse((obj) => {
    if (obj.isMesh) obj.castShadow = true;
  });
  model.scale.set(0.4, 0.4, 0.4);
  scene.add(model);

  const mixer = new THREE.AnimationMixer(model);
  const animations = new Map();
  gltf.animations.forEach((a) => {
    if (a.name !== "TPose") {
      animations.set(a.name, mixer.clipAction(a));
    }
  });

  characterControl = new CharacterControl(
    model,
    mixer,
    control,
    camera,
    animations,
    "Idle"
  );
});

class CharacterControl {
  constructor(
    model,
    mixer,
    orbitControl,
    camera,
    animations = [],
    currentAction
  ) {
    this.model = model;
    this.currentAction = currentAction;
    this.mixer = mixer;
    this.orbitControl = orbitControl;
    this.camera = camera;
    this.animations = animations;
    this.toggleRun = false;

    this.walkDirection = new THREE.Vector3();
    this.rotateAngle = new THREE.Vector3(0, 1, 0);
    this.rotateQuarternion = new THREE.Quaternion();
    this.cameraTarget = new THREE.Vector3();

    this.fadeDuration = 0.2;
    this.runVelocity = 5;
    this.walkVelocity = 2;

    this.animations.forEach((value, key) => {
      if (key === currentAction) {
        value.play();
      }
    });
  }

  switchRunToggle() {
    this.toggleRun = !this.toggleRun;
  }

  update(delta, keysPressed) {
    const isDirectionPressed = ["w", "s", "d", "a"].some(
      (key) => keysPressed[key] === true
    );
    let action = "Idle";
    if (isDirectionPressed) {
      action = "Walk";

      if (this.toggleRun) {
        action = "Run";
      }
    }

    if (this.currentAction !== action) {
      const prevAction = this.animations.get(this.currentAction);
      const currentAction = this.animations.get(action);

      prevAction.fadeOut(this.fadeDuration);
      currentAction.reset().fadeIn(this.fadeDuration).play();
      this.currentAction = action;
    }
    this.mixer.update(delta);

    if (this.currentAction !== "Idle") {
      // calculate toward camera direction
      let angleYCameraDirection = Math.atan2(
        this.camera.position.x - this.model.position.x,
        this.camera.position.z - this.model.position.z
      );

      // diagonal movement angle offset
      let directionOffset = this.directionOffset(keysPressed);

      // rotate model
      this.rotateQuarternion.setFromAxisAngle(
        this.rotateAngle,
        angleYCameraDirection + directionOffset
      );
      this.model.quaternion.rotateTowards(this.rotateQuarternion, 0.15);

      // calculate direction
      this.camera.getWorldDirection(this.walkDirection);
      this.walkDirection.y = 0;
      this.walkDirection.normalize();
      this.walkDirection.applyAxisAngle(this.rotateAngle, directionOffset);

      // run/walk velocity
      const velocity =
        this.currentAction == "Run" ? this.runVelocity : this.walkVelocity;

      // move model & camera
      const moveX = this.walkDirection.x * velocity * delta;
      const moveZ = this.walkDirection.z * velocity * delta;
      this.model.position.x += moveX;
      this.model.position.z += moveZ;
      this.updateCameraTarget(moveX, moveZ);
    }
  }

  updateCameraTarget(moveX, moveZ) {
    // move camera
    this.camera.position.x += moveX;
    this.camera.position.z += moveZ;

    // update camera target
    this.cameraTarget.x = this.model.position.x;
    this.cameraTarget.y = this.model.position.y;
    this.cameraTarget.z = this.model.position.z;
    this.orbitControl.target = this.cameraTarget;
  }

  directionOffset(keysPressed) {
    let directionOffset = 0; // w

    if (keysPressed["w"]) {
      if (keysPressed["a"]) {
        directionOffset = Math.PI / 4; // w+a
      } else if (keysPressed["d"]) {
        directionOffset = -Math.PI / 4; // w+d
      }
    } else if (keysPressed["s"]) {
      if (keysPressed["a"]) {
        directionOffset = Math.PI / 4 + Math.PI / 2; // s+a
      } else if (keysPressed["d"]) {
        directionOffset = -Math.PI / 4 - Math.PI / 2; // s+d
      } else {
        directionOffset = Math.PI; // s
      }
    } else if (keysPressed["a"]) {
      directionOffset = Math.PI / 2; // a
    } else if (keysPressed["d"]) {
      directionOffset = -Math.PI / 2; // d
    }

    return directionOffset;
  }
}

// FUNCTION HANDLER
const keysPressed = {};

initActionKeyboard();

function initActionKeyboard() {
  const onKeyDown = function (event) {
    if (event.shiftKey && characterControl) {
      return characterControl.switchRunToggle();
    }

    keysPressed[event.key] = true;
  };

  const onKeyUp = function (event) {
    keysPressed[event.key] = false;
  };

  function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.render(scene, camera);
  }

  window.addEventListener("resize", onWindowResize);
  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);
}

function createGUI(model) {
  const gui = new GUI();

  const folder = gui.addFolder("Model");
  folder.close();

  const rotationFolder = folder.addFolder("Rotation");
  rotationFolder.add(model.rotation, "x", 0, Math.PI * 2);
  rotationFolder.add(model.rotation, "y", 0, Math.PI * 2);
  rotationFolder.add(model.rotation, "z", 0, Math.PI * 2);
  rotationFolder.open();

  const positionFolder = folder.addFolder("Position");
  positionFolder.add(model.position, "x", -10, 10, 2);
  positionFolder.add(model.position, "y", -10, 10, 2);
  positionFolder.add(model.position, "z", -10, 10, 2);
  positionFolder.open();

  const scaleFolder = folder.addFolder("Scale");
  scaleFolder.add(model.scale, "x", -5, 5);
  scaleFolder.add(model.scale, "y", -5, 5);
  scaleFolder.add(model.scale, "z", -5, 5);
  scaleFolder.open();

  folder.add(model, "visible");

  // const cameraFolder = gui.addFolder("Camera");
  // cameraFolder.open();

  // const cameraPositionFolder = cameraFolder.addFolder("Position");
  // cameraPositionFolder.add(camera.position, "x", 0, 10);
  // cameraPositionFolder.add(camera.position, "y", 0, 10);
  // cameraPositionFolder.add(camera.position, "z", 0, 10);
  // cameraPositionFolder.open();

  // const cameraRotationFolder = cameraFolder.addFolder("Rotation");
  // cameraRotationFolder.add(camera.rotation, "x", 0, 10);
  // cameraRotationFolder.add(camera.rotation, "y", 0, 10);
  // cameraRotationFolder.add(camera.rotation, "z", 0, 10);
  // cameraRotationFolder.open();
}

const clock = new THREE.Clock();
// ANIMATION
function animate() {
  requestAnimationFrame(animate);

  if (characterControl) {
    characterControl.update(clock.getDelta(), keysPressed);
  }
  world.step(timeStep);
  plane.position.copy(planeBody.position);
  plane.quaternion.copy(planeBody.quaternion);

  cube.position.copy(boxBody.position);
  cube.quaternion.copy(boxBody.quaternion);

  sphereMesh.position.copy(sphereBody.position);
  sphereMesh.quaternion.copy(sphereBody.quaternion);

  control.update();
  renderer.setPixelRatio(window.devicePixelRatio);

  renderer.render(scene, camera);
}

// INIT 3D
// Check whether the browser has support WebGL
if (WebGL.isWebGLAvailable()) {
  // Initiate function or other initializations here
  document.getElementById("container").appendChild(renderer.domElement);
  animate();
} else {
  const warning = WebGL.getWebGLErrorMessage();
  document.getElementById("container").appendChild(warning);
}
