import * as THREE from "three";
import WebGL from "three/addons/capabilities/WebGL.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GUI } from "dat.gui";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// SETUP
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.y = 5;
camera.position.z = 5;
camera.position.x = 0;

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
//controls.addEventListener("change", () => renderer.render(scene, camera)); //this line is unnecessary if you are re-rendering within the animation loop

// LIGHT
const light = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(light);

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
    this.cameraTarget.y = this.model.position.y + 1;
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

const plane = new THREE.Mesh(
  new THREE.PlaneGeometry(10, 10),
  new THREE.MeshBasicMaterial({
    color: "#616161",
    side: THREE.DoubleSide,
  })
);
plane.rotation.x = -Math.PI / 2;
scene.add(plane);

scene.add(new THREE.GridHelper(10, 30));

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
