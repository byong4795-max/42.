let peer;
let myId;
let video; // 手機端是本地相機，電腦端是接收到的遠端影像
let handPose;
let hands = [];
let currentAction = 0;
let isPhone = false;
let remoteStreamReady = false;
let connectionStatus = "初始化中..."; // Added for status display
let qrcodeGenerated = false; // 確保 QR Code 只產生一次
let peerError = null; // Added for error display

function setup() {
  createCanvas(windowWidth, windowHeight);

  const urlParams = new URLSearchParams(window.location.search);
  const room = urlParams.get('room');

  // 建立 PeerJS 物件，加入明確的 STUN 伺服器配置以利跨網路連線
  const peerConfig = {
    config: {
      'iceServers': [
        { url: 'stun:stun.l.google.com:19302' },
        { url: 'stun:stun1.l.google.com:19302' }
      ]
    }
  };

  if (room) {
    // 手機端模式
    isPhone = true;
    connectionStatus = "請求相機權限...";
    video = createCapture(VIDEO, (stream) => {
      connectionStatus = "正在建立通訊伺服器連線...";
      peer = new Peer(peerConfig);
      peer.on('open', (id) => {
        myId = id; // Store phone's ID too
        peer.call(room, stream); // 撥號給電腦
        connectionStatus = "正在連線至電腦端...";
      });
      peer.on('error', (err) => {
        console.error("PeerJS Error (Phone):", err);
        peerError = err.type;
        connectionStatus = "連線失敗: " + err.type;
      });
      peer.on('close', () => {
        connectionStatus = "連線已關閉 (Phone)";
      });
    }, (err) => { // Error callback for createCapture
      console.error("Camera access error (Phone):", err);
      connectionStatus = "無法存取相機: " + err.name;
    });
    video.size(640, 480);
    video.hide();
  } else {
    // 電腦端模式
    peer = new Peer(peerConfig);
    peer.on('open', (id) => {
      myId = id;
      connectionStatus = "等待手機連線...";
      if (typeof updateQRCode === 'function' && !qrcodeGenerated) {
        updateQRCode(id);
        qrcodeGenerated = true;
      }
    });
    peer.on('error', (err) => {
      console.error("PeerJS Error (PC):", err);
      peerError = err.type;
      connectionStatus = "連線失敗: " + err.type;
    });
    peer.on('close', () => {
      connectionStatus = "連線已關閉 (PC)";
    });
    peer.on('call', (call) => {
      connectionStatus = "手機已連線，正在接收影像...";
      call.answer(); // 接聽手機的來電
      call.on('stream', (stream) => {
        // 接收手機影像，確保影像物件正確初始化
        if (video) video.remove(); 
        video = createVideo('');
        video.elt.setAttribute('playsinline', '');
        video.elt.srcObject = stream;
        video.elt.play();
        video.elt.muted = true; // 避免回音
        video.elt.setAttribute('playsinline', ''); // Added for remote video
        video.size(640, 480);
        video.hide();
        
        // 初始化 HandPose 偵測
        handPose = ml5.handPose(video, () => {
          console.log("HandPose 模型已準備好");
          remoteStreamReady = true;
          handPose.detectStart(video, results => { hands = results; });
        });
      });
      call.on('close', () => {
        connectionStatus = "手機連線已中斷";
        remoteStreamReady = false;
        video = null; // Clear video
      });
    });
  }
}

function draw() {
  background(0);
  
  let boxW = 640;
  let boxH = 480;
  let x = (width - boxW) / 2;
  let y = (height - boxH) / 2;

  if (isPhone) {
    // 手機端：顯示自己的鏡頭當作預覽
    if (video && video.elt.readyState === 4) { // Check if video is ready
      image(video, 0, 0, width, height, 0, 0, video.width, video.height, COVER);
    } else {
      background(0); // Ensure background is black if video not ready
    }
    
    // 狀態顯示
    fill(0, 150);
    noStroke();
    rect(0, height - 100, width, 100);
    fill(255);
    textAlign(CENTER, CENTER);
    textSize(20);
    text(connectionStatus, width / 2, height - 65);
    if (peerError) {
      fill(255, 100, 100);
      text("錯誤: " + peerError, width / 2, height - 35);
    }
  } else {
    // 電腦端繪製
    stroke(255);
    noFill();
    rect(x, y, boxW, boxH);

    if (remoteStreamReady && video && video.elt.readyState >= 2) { 
      image(video, x, y, boxW, boxH); 
      drawHandRecognition(x, y);
    } else {
      fill(255);
      noStroke();
      textSize(24);
      textAlign(CENTER, CENTER);
      
      if (peerError) {
        fill(255, 100, 100);
        text('連線錯誤: ' + peerError, width / 2, height / 2 - 20);
        textSize(16);
        text('請檢查瀏覽器控制台是否有更多錯誤訊息', width / 2, height / 2 + 20);
      } else {
        text(connectionStatus, width / 2, height / 2);
      }
    }
  }

  // 學生資訊
  fill(255);
  noStroke();
  textSize(20);
  textAlign(CENTER, CENTER);
  text('414730050 曹苡萱', width / 2, y - 20);
}

function drawHandRecognition(offsetX, offsetY) {
  // 使用 handPose 結果繪製點位並分類
  if (!hands || hands.length === 0) {
    currentAction = 0; // 偵測中...
  } else {
    const hand = hands[0];

    // 繪製手部關鍵點
    hand.keypoints.forEach(k => {
      fill(0, 255, 150);
      noStroke();
      ellipse(offsetX + k.x, offsetY + k.y, 8, 8);
    });

    // 動作分類 (基於手指數量)
    currentAction = classifyPose(hand);
  }

  // 將動作編號映射為中文猜拳名稱
  const actionNames = ["偵測中...", "剪刀", "石頭", "布"];

  // 在中間框框顯示醒目的辨識結果
  noStroke();
  fill(0, 150); // 半透明黑色背景
  rectMode(CENTER);
  rect(offsetX + 320, offsetY + 240, 280, 120, 20); 

  fill(255, 255, 0); // 亮黃色
  textSize(80);      // 特大字體
  textAlign(CENTER, CENTER);
  text(actionNames[currentAction], offsetX + 320, offsetY + 240);
  rectMode(CORNER);  // 還原繪圖模式以免影響其他部分
}

function classifyPose(hand) {
  if (!hand || !hand.keypoints) return 0;
  const k = hand.keypoints;
  let count = 0;

  // 檢查四根手指 (食指、中指、無名指、小指)
  // 指尖(tip) Y座標小於關節(pip)時，代表手指伸直
  if (k[8].y < k[6].y) count++;   // 食指
  if (k[12].y < k[10].y) count++; // 中指
  if (k[16].y < k[14].y) count++; // 無名指
  if (k[20].y < k[18].y) count++; // 小指

  // 檢查大拇指 (利用與手掌中心的距離來判斷是否伸出)
  let thumbDist = dist(k[4].x, k[4].y, k[2].x, k[2].y);
  if (thumbDist > 40) count++;

  // 依照手指數量判定
  if (count === 0) return 2; // 石頭
  if (count === 2) return 1; // 剪刀
  if (count === 5) return 3; // 布
  return 0; // 其他數量顯示偵測中
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}