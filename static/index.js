const LOGIN_PATH = `https://01.gritlab.ax/api/auth/signin`;
const GRAPHQL_PATH = `https://01.gritlab.ax/api/graphql-engine/v1/graphql`;

const LOGIN_DIV = document.getElementById("login_div");
const PROFILE_DIV = document.getElementById("profile_div");

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
    refresh();
};

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
            showMessage("query successful!");
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
    showMessage("rendering profile");
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
    console.log(completed);
    console.log(xp_view);
    drawTimeline(completed);
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
    if (!group) {
        return ["meself"]
    } 
    if (!Array.isArray(group.members)) return ["meself"];
    return group.members.map(m => m.userLogin);
}

function drawTimeline(data) {
    const timelineSVG = document.getElementById("timelineSVG");
    const centerX = timelineSVG.clientWidth / 2;

    const maxHeight = 650;
    const minDate = Math.min(...data.map(prj => getDatePosition(prj.createdAt)));
    const maxDate = Math.max(...data.map(prj => getDatePosition(prj.createdAt)));

    const dottedLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
    dottedLine.setAttribute("x1", centerX);
    dottedLine.setAttribute("y1", 20);
    dottedLine.setAttribute("x2", centerX);
    dottedLine.setAttribute("y2", maxHeight+20);
    dottedLine.setAttribute("stroke", "#b77ac7");
    dottedLine.setAttribute("stroke-width", "1");
    dottedLine.setAttribute("stroke-dasharray", "4,4");
    timelineSVG.appendChild(dottedLine);

    const tooltip = document.getElementById("tooltip");

    data.forEach((prj, index) => {
        const isEven = index%2 === 0;
        const eventDate = getDatePosition(prj.createdAt);
        const scaledPosition = ((eventDate - minDate) / (maxDate - minDate)) * maxHeight +20;

        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", centerX);
        circle.setAttribute("cy", scaledPosition);
        circle.setAttribute("r", 3);
        circle.setAttribute("fill", "#b77ac7");

        circle.addEventListener("mouseover", (event) => {
            const teamMembers = getTeammates(prj.group);

            tooltip.textContent = `Team: ${teamMembers.join(', ')}`;
            tooltip.style.left = event.clientX + 10 + window.scrollX + "px";
            tooltip.style.top =  event.clientY + 10 + window.scrollY + "px";
            tooltip.style.display = "block";
        });

        circle.addEventListener("mouseout", () => {
            tooltip.style.display = "none";
        });
      
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", centerX + 10);
      text.setAttribute("y", scaledPosition +5);
      text.setAttribute("fill", "white");
      text.setAttribute("font-size", "12");
      text.textContent = `[${formatDate(prj.createdAt)}] ${prj.path.split('/').pop()}`;
      if (!isEven) {
          text.setAttribute("x", centerX - 10);
          text.setAttribute("text-anchor", "end");
      }

      timelineSVG.appendChild(circle);
      timelineSVG.appendChild(text);
    });
}