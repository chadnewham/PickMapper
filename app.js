let data = { parents: {}, modifiers: {}, pickGroups: {} };
let currentPaletteTab = 0;

function saveData() {
    localStorage.setItem('menuBuilderData', JSON.stringify(data));
}

function loadData() {
    const saved = localStorage.getItem('menuBuilderData');
    if (saved) data = JSON.parse(saved);
}

// ==================== RENDERING ====================
function renderParents() {
    const container = document.getElementById('parents-grid');
    container.innerHTML = '';

    if (Object.keys(data.parents).length === 0) {
        container.innerHTML = `<div class="empty-state">No parent items yet.<br>Load sample data to begin.</div>`;
        return;
    }

    Object.values(data.parents).forEach(parent => {
        let groupsHTML = '';

        parent.pickGroupNames.forEach(groupName => {
            const group = data.pickGroups[groupName];
            if (!group) return;

            const modsHTML = group.modifierIds.map(mid => {
                const mod = data.modifiers[mid];
                return mod ? `<span class="chip">${mod.description} <span onclick="removeModifierFromGroup('${groupName}', '${mid}'); event.stopImmediatePropagation()" style="color:#ef4444;cursor:pointer;margin-left:4px;">×</span></span>` : '';
            }).join('');

            groupsHTML += `
                <div class="pick-group" data-group="${groupName}" data-parent="${parent.id}">
                    <div class="pick-group-header">
                        📦 ${groupName}
                        <button onclick="removeGroupFromParent('${parent.id}', '${groupName}'); event.stopImmediatePropagation()"
                                class="btn-sm">Remove</button>
                    </div>
                    <div style="min-height:48px; display:flex; flex-wrap:wrap; gap:4px;">${modsHTML || '<span style="color:#64748b;font-size:13px;">Drop modifiers here</span>'}</div>
                </div>
            `;
        });

        const card = document.createElement('div');
        card.className = 'parent-card';
        card.innerHTML = `
            <div class="parent-header">
                <div class="parent-id">${parent.id}</div>
                <div style="font-weight:600; font-size:17.5px;">${parent.description}</div>
            </div>
            <div class="dropzone" style="min-height:200px; border:2px dashed #475569; border-radius:12px; padding:12px;">
                ${groupsHTML || '<div style="text-align:center; color:#64748b; padding:50px 0;">Drop pick groups here</div>'}
            </div>
        `;
        container.appendChild(card);
    });

    attachDropListeners();
}

function renderPalette() {
    const groupContainer = document.getElementById('palette-groups');
    groupContainer.innerHTML = '';
    Object.keys(data.pickGroups).forEach(name => {
        const div = document.createElement('div');
        div.className = 'draggable';
        div.draggable = true;
        div.textContent = `📦 ${name}`;
        div.dataset.type = 'group';
        div.dataset.value = name;
        div.addEventListener('dragstart', dragStart);
        groupContainer.appendChild(div);
    });

    renderModifiersList();
}

function renderModifiersList(filtered = null) {
    const container = document.getElementById('palette-modifiers');
    container.innerHTML = '';

    const mods = filtered || Object.values(data.modifiers);

    mods.forEach(mod => {
        const div = document.createElement('div');
        div.className = 'draggable';
        div.draggable = true;
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.style.alignItems = 'center';
        div.innerHTML = `
            ${mod.description}
            <button onclick="deleteModifier('${mod.id}'); event.stopImmediatePropagation()"
                    class="btn-sm">Delete</button>
        `;
        div.dataset.type = 'modifier';
        div.dataset.value = mod.id;
        div.addEventListener('dragstart', dragStart);
        container.appendChild(div);
    });
}

function filterCurrentTab() {
    const term = document.getElementById('search-input').value.toLowerCase().trim();

    if (currentPaletteTab === 0) {
        const container = document.getElementById('palette-groups');
        container.innerHTML = '';
        Object.keys(data.pickGroups).filter(name =>
            name.toLowerCase().includes(term)
        ).forEach(name => {
            const div = document.createElement('div');
            div.className = 'draggable';
            div.draggable = true;
            div.textContent = `📦 ${name}`;
            div.dataset.type = 'group';
            div.dataset.value = name;
            div.addEventListener('dragstart', dragStart);
            container.appendChild(div);
        });
    } else {
        const filtered = Object.values(data.modifiers).filter(m =>
            m.description.toLowerCase().includes(term) || m.id.toLowerCase().includes(term)
        );
        renderModifiersList(filtered);
    }
}

// ==================== DRAG & DROP ====================
function dragStart(e) {
    e.dataTransfer.setData('text/type', e.target.dataset.type);
    e.dataTransfer.setData('text/value', e.target.dataset.value);
}

function attachDropListeners() {
    document.querySelectorAll('.dropzone').forEach(zone => {
        zone.addEventListener('dragover', e => { e.preventDefault(); zone.style.borderColor = '#3b82f6'; });
        zone.addEventListener('dragleave', () => zone.style.borderColor = '#475569');
        zone.addEventListener('drop', e => handleGroupDrop(e, zone));
    });

    document.querySelectorAll('.pick-group').forEach(el => {
        el.addEventListener('dragover', e => e.preventDefault());
        el.addEventListener('drop', e => handleModifierDrop(e, el));
    });
}

function handleGroupDrop(e, zone) {
    e.preventDefault();
    const type = e.dataTransfer.getData('text/type');
    const value = e.dataTransfer.getData('text/value');
    if (type !== 'group') return;

    const parentCard = zone.closest('.parent-card');
    const parentId = Object.keys(data.parents).find(id => parentCard.textContent.includes(id));
    if (parentId) {
        const parent = data.parents[parentId];
        if (!parent.pickGroupNames.includes(value)) {
            parent.pickGroupNames.push(value);
            saveData();
            renderParents();
        }
    }
}

function handleModifierDrop(e, groupEl) {
    e.preventDefault();
    const type = e.dataTransfer.getData('text/type');
    const value = e.dataTransfer.getData('text/value');
    if (type !== 'modifier') return;

    const groupName = groupEl.dataset.group;
    const group = data.pickGroups[groupName];
    if (group && !group.modifierIds.includes(value)) {
        group.modifierIds.push(value);
        saveData();
        renderParents();
    }
}

// ==================== ACTIONS ====================
function deleteModifier(id) {
    if (!confirm(`Delete modifier "${id}"?`)) return;
    delete data.modifiers[id];
    Object.values(data.pickGroups).forEach(g => {
        g.modifierIds = g.modifierIds.filter(m => m !== id);
    });
    saveData();
    renderPalette();
    renderParents();
    updateStats();
}

function removeModifierFromGroup(groupName, modId) {
    const group = data.pickGroups[groupName];
    if (group) {
        group.modifierIds = group.modifierIds.filter(id => id !== modId);
        saveData();
        renderParents();
    }
}

function removeGroupFromParent(parentId, groupName) {
    if (!confirm(`Remove "${groupName}" from this parent?`)) return;
    const parent = data.parents[parentId];
    if (parent) {
        parent.pickGroupNames = parent.pickGroupNames.filter(g => g !== groupName);
        saveData();
        renderParents();
    }
}

function showAddModifierModal() {
    document.getElementById('add-modifier-modal').style.display = 'flex';
    const count = Object.keys(data.modifiers).length + 1;
    document.getElementById('new-mod-id').value = `placeholder-${String(count).padStart(3, '0')}`;
}

function addNewModifier() {
    const id = document.getElementById('new-mod-id').value.trim();
    const desc = document.getElementById('new-mod-desc').value.trim();
    if (!id || !desc) return alert("ID and description required");

    data.modifiers[id] = { id, description: desc };
    saveData();
    hideModals();
    renderPalette();
    updateStats();
}

function showCreateGroupModal() {
    document.getElementById('create-group-modal').style.display = 'flex';
}

function createNewPickGroup() {
    const name = document.getElementById('new-group-name').value.trim();
    if (!name) return alert("Group name required");
    if (data.pickGroups[name]) return alert("Group already exists");

    data.pickGroups[name] = { name, modifierIds: [] };
    saveData();
    hideModals();
    renderPalette();
    updateStats();
}

function hideModals() {
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
}

function updateStats() {
    const p = Object.keys(data.parents).length;
    const m = Object.keys(data.modifiers).length;
    const g = Object.keys(data.pickGroups).length;
    document.getElementById('stats').textContent = `${p} parents • ${m} modifiers • ${g} groups`;
}

function switchPaletteTab(tab) {
    currentPaletteTab = tab;
    document.querySelectorAll('.tab').forEach((t, i) => {
        t.classList.toggle('active', i === tab);
    });
    document.getElementById('tab-content-0').style.display = tab === 0 ? 'block' : 'none';
    document.getElementById('tab-content-1').style.display = tab === 1 ? 'block' : 'none';

    document.getElementById('search-input').value = '';
    filterCurrentTab();
}

function loadSampleData() {
    data = {
        parents: { "BURGER-001": { id: "BURGER-001", description: "Cheese Burger", pickGroupNames: ["Meat Options", "Cheese Options", "Toppings"] } },
        modifiers: {
            "MEAT-01": {id:"MEAT-01", description:"Brisket Blend"},
            "MEAT-02": {id:"MEAT-02", description:"Smash Patty"},
            "CHEESE-01": {id:"CHEESE-01", description:"Cheddar"},
            "CHEESE-02": {id:"CHEESE-02", description:"American"},
            "CHEESE-03": {id:"CHEESE-03", description:"Swiss"},
            "TOP-01": {id:"TOP-01", description:"Lettuce"},
            "TOP-02": {id:"TOP-02", description:"Tomato"},
            "TOP-03": {id:"TOP-03", description:"Onion"}
        },
        pickGroups: {
            "Meat Options": {name:"Meat Options", modifierIds:["MEAT-01","MEAT-02"]},
            "Cheese Options": {name:"Cheese Options", modifierIds:["CHEESE-01","CHEESE-02","CHEESE-03"]},
            "Toppings": {name:"Toppings", modifierIds:["TOP-01","TOP-02","TOP-03"]}
        }
    };
    saveData();
    renderAll();
}

function exportFullJSON() {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `menu-relationships-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
}

function renderAll() {
    renderParents();
    renderPalette();
    updateStats();
}

window.onload = () => {
    loadData();
    renderAll();
    switchPaletteTab(0);
};
