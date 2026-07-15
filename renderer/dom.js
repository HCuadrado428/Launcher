const loginScreen = document.getElementById('loginScreen');
const mainScreen = document.getElementById('mainScreen');
const modpacksScreen = document.getElementById('modpacksScreen');

const languageSelect = document.getElementById('languageSelect');
const themeSwitcher = document.getElementById('themeSwitcher');
const themeSwatches = document.querySelectorAll('.theme-swatch');

const updateBanner = document.getElementById('updateBanner');
const updateBannerText = document.getElementById('updateBannerText');
const updateRestartBtn = document.getElementById('updateRestartBtn');
const updateModal = document.getElementById('updateModal');
const updatePopupMessage = document.getElementById('updatePopupMessage');
const updatePopupNotes = document.getElementById('updatePopupNotes');
const updateYesBtn = document.getElementById('updateYesBtn');
const updateLaterBtn = document.getElementById('updateLaterBtn');
const checkUpdatesBtn = document.getElementById('checkUpdatesBtn');

const offlineUsername = document.getElementById('offlineUsername');
const offlineLoginBtn = document.getElementById('offlineLoginBtn');
const msLoginBtn = document.getElementById('msLoginBtn');

const avatar = document.getElementById('avatar');
const accountName = document.getElementById('accountName');
const accountType = document.getElementById('accountType');
const switchAccountBtn = document.getElementById('switchAccountBtn');

const accountsModal = document.getElementById('accountsModal');
const accountsList = document.getElementById('accountsList');
const closeAccountsModalBtn = document.getElementById('closeAccountsModalBtn');
const addOfflineAccountBtn = document.getElementById('addOfflineAccountBtn');
const addMicrosoftAccountBtn = document.getElementById('addMicrosoftAccountBtn');

const javaPathInput = document.getElementById('javaPath');
const browseBtn = document.getElementById('browseBtn');
const detectBtn = document.getElementById('detectBtn');
const javaHint = document.getElementById('javaHint');

const ramSlider = document.getElementById('ramSlider');
const ramValue = document.getElementById('ramValue');
const ramHint = document.getElementById('ramHint');
const customJvmArgsInput = document.getElementById('customJvmArgsInput');

const playBtn = document.getElementById('playBtn');
const stopBtn = document.getElementById('stopBtn');
const openConsoleBtn = document.getElementById('openConsoleBtn');
const consoleModal = document.getElementById('consoleModal');
const consoleLogBox = document.getElementById('consoleLogBox');
const closeConsoleModalBtn = document.getElementById('closeConsoleModalBtn');
const copyLogBtn = document.getElementById('copyLogBtn');
const clearLogBtn = document.getElementById('clearLogBtn');
const openCrashLogsBtn = document.getElementById('openCrashLogsBtn');
const progressWrap = document.getElementById('progressWrap');
const progressFill = document.getElementById('progressFill');
const progressLabel = document.getElementById('progressLabel');
const toastWrap = document.getElementById('toastWrap');

const activeModpackLabel = document.getElementById('activeModpackLabel');
const playtimeLabel = document.getElementById('playtimeLabel');
const openModpacksBtn = document.getElementById('openModpacksBtn');
const backToMainBtn = document.getElementById('backToMainBtn');
const useVanillaBtn = document.getElementById('useVanillaBtn');

const inviteLinkInput = document.getElementById('inviteLinkInput');
const redeemInviteBtn = document.getElementById('redeemInviteBtn');
const newModpackName = document.getElementById('newModpackName');
const newModpackVersion = document.getElementById('newModpackVersion');
const newModpackLoader = document.getElementById('newModpackLoader');
const loaderVersionField = document.getElementById('loaderVersionField');
const newModpackLoaderVersion = document.getElementById('newModpackLoaderVersion');
const createModpackBtn = document.getElementById('createModpackBtn');
const ownedModpacksList = document.getElementById('ownedModpacksList');
const sharedModpacksList = document.getElementById('sharedModpacksList');
const storageUsageBar = document.getElementById('storageUsageBar');
const storageUsageFill = document.getElementById('storageUsageFill');
const storageUsageText = document.getElementById('storageUsageText');
const modpackSearchInput = document.getElementById('modpackSearchInput');
const backendStatusDot = document.getElementById('backendStatusDot');
const backendStatusText = document.getElementById('backendStatusText');

const openImportModalBtn = document.getElementById('openImportModalBtn');
const importModal = document.getElementById('importModal');
const closeImportModalBtn = document.getElementById('closeImportModalBtn');
const scanLocalModpacksBtn = document.getElementById('scanLocalModpacksBtn');
const importResults = document.getElementById('importResults');
const curseforgeApiKeyInput = document.getElementById('curseforgeApiKeyInput');
const saveCurseforgeApiKeyBtn = document.getElementById('saveCurseforgeApiKeyBtn');

const modsModal = document.getElementById('modsModal');
const modsModalTitle = document.getElementById('modsModalTitle');
const modsTypeTab = document.getElementById('modsTypeTab');
const resourcepacksTypeTab = document.getElementById('resourcepacksTypeTab');
const modsList = document.getElementById('modsList');
const addModBtn = document.getElementById('addModBtn');
const modrinthSearchInput = document.getElementById('modrinthSearchInput');
const modrinthSearchBtn = document.getElementById('modrinthSearchBtn');
const modrinthResults = document.getElementById('modrinthResults');
const closeModsModalBtn = document.getElementById('closeModsModalBtn');
const generateInviteBtn = document.getElementById('generateInviteBtn');
const inviteResultBox = document.getElementById('inviteResultBox');
const inviteField = document.getElementById('inviteField');
const inviteMaxUsesInput = document.getElementById('inviteMaxUsesInput');
const inviteExpiresHoursInput = document.getElementById('inviteExpiresHoursInput');
const inviteNonPremiumHint = document.getElementById('inviteNonPremiumHint');
const accessManagementSection = document.getElementById('accessManagementSection');
const invitesList = document.getElementById('invitesList');
const accessList = document.getElementById('accessList');
const versionHistorySection = document.getElementById('versionHistorySection');
const versionsList = document.getElementById('versionsList');
const leaveModpackBtn = document.getElementById('leaveModpackBtn');
const deleteModpackBtn = document.getElementById('deleteModpackBtn');
const repairModpackBtn = document.getElementById('repairModpackBtn');
const verifyModpackBtn = document.getElementById('verifyModpackBtn');
const exportModpackBtn = document.getElementById('exportModpackBtn');
const setCoverBtn = document.getElementById('setCoverBtn');
const modpackHealthStatus = document.getElementById('modpackHealthStatus');
