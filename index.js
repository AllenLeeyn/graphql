const LOGIN_PATH = `https://01.gritlab.ax/api/auth/signin`;
const GRAPHQL_PATH = `https://01.gritlab.ax/api/graphql-engine/v1/graphql`;

const LOGIN_DIV = document.getElementById("login_div");
const PROFILE_DIV = document.getElementById("profile_div");

const TOOLTIP = document.getElementById("tooltip");
const TIMELINE_SVG = document.getElementById("timelineSVG");
const XP_SVG = document.getElementById("xpSVG");
const RATIO_SVG = document.getElementById("ratioSVG");
const SKILL_SVG = document.getElementById("skillSVG");

const XP_TABLE = document.querySelector("#xpTable tbody");
const RATIO_TABLE = document.querySelector("#ratioTable tbody");
const SKILL_TABLE = document.querySelector("#skillTable tbody");

const USER_INFO_QUERY = `
{
    user {
        id
        login
        attrs
        campus
        labels {
            labelId
            labelName
        }
        createdAt
        updatedAt
        auditRatio
        totalUp
        totalUpBonus
        totalDown
    }
    
    wip: progress (
        where: {isDone: {_eq: false}, grade : {_is_null: true}}
        order_by: [{createdAt: asc}]
    ){
        id
        eventId
        createdAt
        updatedAt
        path
        group{
            members{
                userLogin
            }
        }
    }
}`;

const USER_PROJECT_QUERY = (eventId) =>`{
    completed: result (
        order_by: [{createdAt: desc}]
        where: { isLast: { _eq: true}, type : {_nin: ["tester", "admin_audit", "dedicated_auditors_for_event"]}}
    ) {
        objectId
        path
        createdAt
        group{
            members{
                userLogin
            }
        }
    }

    xp_view: transaction(
        order_by: [{ createdAt: desc }]
        where: { type: { _like: "xp" }, eventId: {_eq: ${eventId}}}
    ) {
        objectId
        path
        amount
        createdAt
    }

    audits: transaction(
        order_by: [{ createdAt: desc }]
        where: { type: { _in: ["up", "down"] }, eventId: {_eq: ${eventId}}}
    ) {
  			attrs
    		type
        objectId
        path
        amount
        createdAt
    }
}`;

const USER_SKILL_QUERY = `{
    skills: transaction(
        order_by: [{ type: desc }, { amount: desc }]
        distinct_on: [type]
        where: { type: { _like: "skill_%" } }
    ) {
        objectId
        eventId
        type
        amount
        createdAt
    }
}`;

const generateQueryJson = (queryStr) => JSON.stringify({query: queryStr});

/*------ refresh current display function ------*/
function refresh(){
    LOGIN_DIV.style.display = "none";
    PROFILE_DIV.style.display = "none";

    const token = sessionStorage.getItem("jwt");

    if (isTokenValid(token)) {  
        PROFILE_DIV.style.display = "block";
        renderProfile();
    } else {
        LOGIN_DIV.style.display = "block";
    }
}
refresh();

function isTokenValid(token) {
    if (!token) return false;

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const expirationTime = payload.exp * 1000;
      const currentTime = Date.now();
      return currentTime < expirationTime;

    } catch (error) {
      console.error("Invalid token:", error);
      return false;
    }
}

/*------ toast message function ------*/
function showMessage(message) {
    if (message === "") return;
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('toast-message');
    messageDiv.textContent = message;
    document.body.appendChild(messageDiv);
    setTimeout(() => messageDiv.remove(), 3000);
}

/*------ login function ------*/
document.getElementById('login-btn').onclick = function (event){
    event.preventDefault();
    const form = document.getElementById('logInForm');
    const formData = new FormData(form);

    const id = formData.get('userField');
    const pw = formData.get('password');

    if (id.trim() === "") {
        return showMessage("Email/ Username is required.");
    }
    if (pw.trim() === "") {
        return showMessage("Password is required.");
    }

    fetch(LOGIN_PATH, {
        method: 'POST',
        headers: {Authorization: `Basic ${window.btoa(`${id}:${pw}`)}`},
    }).then( async response => {
        if (response.ok){
            showMessage("Log in successful!");
            const token = await response.json();
            sessionStorage.setItem("jwt", token);
            refresh();

        } else{
            response.json().then(errorData => {showMessage(errorData.error)});
        }
    }).catch(error =>{
        console.error("Error:", error);
        showMessage("An error occurred. Please check your connection.");
    });
};

document.getElementById('logout-btn').onclick = function (event){
    event.preventDefault();
    sessionStorage.removeItem("jwt");
    showMessage("Log out successful!");
    TIMELINE_SVG.innerHTML = "";
    XP_SVG.innerHTML = "";
    RATIO_SVG.innerHTML = "";
    SKILL_SVG.innerHTML = "";
    XP_TABLE.innerHTML = "";
    refresh();
};

/*------ query function ------*/
async function executeGraphql(query){
    const jwtToken = sessionStorage.getItem("jwt");
    return fetch(GRAPHQL_PATH, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${jwtToken}`},
        body: generateQueryJson(query)
    }).then( response => {
        if (response.ok){
            const data = response.json();
            return data
        } else{
            response.json().then(errorData => {showMessage(errorData.error)});
        }
    }).catch(error =>{
        console.error("Error:", error);
        showMessage("An error occurred. Please check your connection.");
    });
};

function insertData(label, data){
    const ele = document.getElementById(label);
    ele.textContent = data;
}

async function renderProfile(){
    const data = await executeGraphql(USER_INFO_QUERY);
    const user = data.data.user[0];
    const wip = data.data.wip;
    const schEventId = wip[0].eventId;

    insertData("campus", `[${user.campus}:${user.labels[0].labelName}]`);
    insertData("id", `${user.id}`);
    insertData("login", `${user.login}`);

    insertData("name", `${user.attrs.firstName} ${user.attrs.lastName}`);
    insertData("email", `${user.attrs.email}`);
    insertData("gender", `${user.attrs.gender}`);
    insertData("nationality", `${user.attrs.nationality}`);

    const projectData = await executeGraphql(USER_PROJECT_QUERY(schEventId));
    const completed = projectData.data.completed;
    const xp_view = projectData.data.xp_view;
    const audits = projectData.data.audits;
    drawTimeline(completed, wip);
    drawXP(xp_view);
    drawRatio(user, audits);

    const skillData = await executeGraphql(USER_SKILL_QUERY);
    const skills = skillData.data.skills
    drawSkill(skills);
};

function getDatePosition(dateStr) {
    const date = new Date(dateStr);
    return date.getTime();
};

function formatDate(dateStr) {
    const date = new Date(dateStr);
    return `${date.toLocaleDateString()}`;
};

function getTeammates(group){
    if (!group) return ["meself"];
    if (!Array.isArray(group.members)) return ["meself"];
    return group.members.map(m => m.userLogin);
}

function addCircle(x, y, r, fill, parent){
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", x);
    circle.setAttribute("cy", y);
    circle.setAttribute("r", r);
    circle.setAttribute("fill", fill);
    parent.appendChild(circle);
    return circle;
}

function addText(x, y, fill, size, content, parent){
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", x);
    text.setAttribute("y", y);
    text.setAttribute("fill", fill);
    text.setAttribute("font-size", size);
    text.textContent = content;
    parent.appendChild(text);
    return text
}

function addLine(x1, y1, x2, y2, stroke, width, parent){
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", x1);
    line.setAttribute("y1", y1);
    line.setAttribute("x2", x2);
    line.setAttribute("y2", y2);
    line.setAttribute("stroke", stroke);
    line.setAttribute("stroke-width", width);
    parent.appendChild(line);
    return line
}

function addPath(data, stroke, parent){
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", data);
    path.setAttribute("fill", "transparent");
    path.setAttribute("stroke", stroke);
    path.setAttribute("stroke-width", "1");
    parent.appendChild(path);
    return path
}

function getRange(data, property){
    const min = data[0][property];
    const max = data[data.length - 1][property];
    const range = max - min;
    return [min, max, range]
}

function addProject(prj, index, pointColor, textColor, centerX, maxHeight, minDate, maxDate) {
    const isEven = index%2 === 0;
    const eventDate = getDatePosition(prj.createdAt);
    const scaledPosition = ((eventDate - minDate) / (maxDate - minDate)) * maxHeight +20;

    const circle = addCircle(centerX, scaledPosition, 3, pointColor, TIMELINE_SVG);

    circle.addEventListener("mouseover", (event) => {
        const teamMembers = getTeammates(prj.group);
        TOOLTIP.textContent = `Team: ${teamMembers.join(', ')}`;
        TOOLTIP.style.left = event.clientX + 10 + window.scrollX + "px";
        TOOLTIP.style.top =  event.clientY + 10 + window.scrollY + "px";
        TOOLTIP.style.display = "block";
    });

    circle.addEventListener("mouseout", () => {
        TOOLTIP.style.display = "none";
    });
  
    const content = `[${formatDate(prj.createdAt)}] ${prj.path.split('/').pop()}`;
    const text = addText(centerX + 10, scaledPosition +5, textColor, "12", content, TIMELINE_SVG);
    if (!isEven) {
        text.setAttribute("x", centerX - 10);
        text.setAttribute("text-anchor", "end");
    }
}

function drawTimeline(completed, wip) {
    const centerX = TIMELINE_SVG.clientWidth / 2;

    const maxHeight = 650;
    completed.forEach(prj => {prj.createdAt = new Date(prj.createdAt)});
    completed.sort((a, b) => a.createdAt - b.createdAt);
    const [minDate, maxDate, _] = getRange(completed, "createdAt");

    const dottedLine = addLine(centerX, 20, centerX, maxHeight+20, "#b77ac7", "1", TIMELINE_SVG);
    dottedLine.setAttribute("stroke-dasharray", "4,4");

    completed.forEach((prj, index) => {
        addProject(prj, index, "#b77ac7", "palegreen", centerX, maxHeight, minDate, maxDate)
    });

    wip.forEach((prj, index) => {
        addProject(prj, index, "red", "pink", centerX, maxHeight, minDate, maxDate)
    });
}

function addCell(content, parent) {
    const cell = document.createElement("td");
    cell.textContent = content;
    parent.appendChild(cell);
}

function addXpEntry(item){
    const row = document.createElement("tr");
    const cleanedPath = item.path.replace('/gritlab/school-curriculum/', '');
    addCell(cleanedPath, row);
    addCell(`${item.amount} xp`, row);
    addCell(formatDate(item.createdAt), row);
    XP_TABLE.prepend(row);
}

function drawXP(data){
    const chartWidth = XP_SVG.clientWidth;
    const chartHeight = XP_SVG.clientHeight;
    const xScale = XP_SVG.clientWidth - 100;
    const yScale = XP_SVG.clientHeight - 100;
    const margin = 50;

    data.forEach(item => {item.createdAt = new Date(item.createdAt)});
    data.sort((a, b) => a.createdAt - b.createdAt);
    const [minTime, _, timeRange] = getRange(data, "createdAt");

    let cumulativeXP = 0;
    data.forEach(item => {
        cumulativeXP += item.amount;
        item.cumulativeXP = cumulativeXP;
    });
    const [minXP, maxXP, xpRange] = getRange(data, "cumulativeXP");

    function getXY(xValue, yValue) {
        const x = margin + (xScale * (xValue - minTime)) / timeRange;
        const y = chartHeight - margin - (yScale * (yValue - minXP)) / xpRange;
        return { x, y };
    }
    
    addLine(margin, margin, margin, chartHeight - margin, "white", "1", XP_SVG);
    const stepSize = (maxXP - minXP) / 5;
    for (let i = 0; i <= 5; i++) {
        const yValue = maxXP - i * stepSize;
        const { x, y } = getXY(data[0].createdAt, yValue);
        const text = addText(x - 10, y, "white", "10", yValue.toFixed(0), XP_SVG);
        text.setAttribute("text-anchor", "end");
    }

    addLine(margin, chartHeight - margin, chartWidth - margin, chartHeight - margin, "white", "1", XP_SVG);
    addText(margin, chartHeight - margin + 15, "white", "10", formatDate(data[0].createdAt), XP_SVG);
    addText(chartWidth - margin, chartHeight - margin + 15, "white", "10", formatDate(data[data.length - 1].createdAt), XP_SVG);

    let pathData = [];
    data.forEach((item) => {
        const { x, y } = getXY(item.createdAt, item.cumulativeXP);
        pathData.push(`${x} ${y}`);
        addCircle(x, y, "2", "#b77ac7" , XP_SVG)
        addXpEntry(item)
    });
    const pathStr = `M ${pathData.join(" L ")}`;
    addPath(pathStr, "#b77ac7", XP_SVG);
    addXpEntry({amount: cumulativeXP, path: "TOTAL", createdAt: new Date()});
}

function addRect(x, y, width, height, fill, parent) {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', x);
    rect.setAttribute('y', y);
    rect.setAttribute('width', width);
    rect.setAttribute('height', height);
    rect.setAttribute('fill', fill);
    parent.appendChild(rect);
    return rect;
}

function addRatioEntry(item){
    const row = document.createElement("tr");
    const cleanedPath = item.path.replace('/gritlab/school-curriculum/', '');
    addCell(`${item.attrs.auditId}`, row);
    addCell(`${item.type}`, row);
    addCell(cleanedPath, row);
    addCell(`${item.amount}`, row);
    if (item.type === "down") row.style.color = "#975aa7";
    RATIO_TABLE.appendChild(row);
}

function drawRatio(user, audits){
    const totalUp = user.totalUp;
    const totalUpBonus = user.totalUpBonus;
    const totalDown = user.totalDown;

    const maxValue = Math.max(totalUp, totalDown);

    const chartWidth = RATIO_SVG.clientWidth - 250;
    const barWidth = 50;

    const totalUpWidth = (totalUp / maxValue) * chartWidth;
    addRect(10, 30, totalUpWidth, barWidth, "white", RATIO_SVG);
    addText(25, 66, "#975aa7", "32", totalUp, RATIO_SVG)

    const totalUpBonusWidth = (totalUpBonus / maxValue) * chartWidth;
    addRect(10 + totalUpWidth, 30, totalUpBonusWidth, barWidth, "#975aa7", RATIO_SVG);
    const text = addText(totalUpWidth , 62, "#975aa7", "16", totalUpBonus, RATIO_SVG)
    text.setAttribute("text-anchor", "end");

    const totalDownWidth = (totalDown / maxValue) * chartWidth;
    addRect(10, 80, totalDownWidth, barWidth, "#975aa7", RATIO_SVG);
    addText(25, 116, "white", "32", totalDown, RATIO_SVG)

    const ratio = ((totalUp )/ totalDown).toFixed(3);
    addText(chartWidth + 30, 45, "gold", "20", "ratio", RATIO_SVG)
    addText(chartWidth + 30, 110, "gold", "72", ratio, RATIO_SVG)

    audits.forEach(addRatioEntry);
}

function addSkillEntry(item){
    const row = document.createElement("tr");
    const cleanedName = item.type.replace('skill_', '');
    addCell(cleanedName, row);
    addCell(`${item.amount}`, row);
    SKILL_TABLE.prepend(row);
}

function drawSkill(skillData){
    const centerX = SKILL_SVG.clientWidth / 2;
    const centerY = SKILL_SVG.clientHeight / 2;
    const maxRadius = 100;
    const radiusStep = maxRadius/10;
    const count = skillData.length;
    const angleStep = (2 * Math.PI) / count;

    function getXY(centerX, centerY, radius, angle) {
        return [centerX + radius * Math.cos(angle), centerY + radius * Math.sin(angle)]
    }

    for (let radius = radiusStep; radius <= maxRadius; radius += radiusStep) {
        const circle = addCircle(centerX, centerY, radius, "transparent", SKILL_SVG)
        circle.setAttribute('stroke', 'white');
    }

    let pathData = [];
    skillData.forEach((item, index)=>{
        const angle = angleStep * index;
        const [x, y] = getXY(centerX, centerY, maxRadius, angle)
        addLine(centerX, centerY, x, y, "white", "1", SKILL_SVG)
        
        const [textX, textY] = getXY(centerX, centerY, maxRadius+20, angle)
        const text = addText(textX, textY, "white", "10", item.type.replace('skill_', ''), SKILL_SVG);
        text.setAttribute("text-anchor", "middle");

        const text2 = addText(textX, textY+10, "#b77ac7", "10", item.amount, SKILL_SVG);
        text2.setAttribute("text-anchor", "middle");
        
        const [xValue, yValue] = getXY(centerX, centerY, item.amount, angle)
        pathData.push(`${xValue} ${yValue}`);
        addSkillEntry(item);
    })
    const pathStr = `M ${pathData.join(" L ")}`;
    const path = addPath(pathStr, "#b77ac7", SKILL_SVG);
    path.setAttribute("fill", "#b77ac7");
}