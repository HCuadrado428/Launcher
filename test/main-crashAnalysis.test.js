// analyzeCrashLog reconoce las causas de crash más habituales para poder
// dar un consejo concreto en vez de solo "se cerró con código 1".
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { analyzeCrashLog } = require('../main/crashAnalysis');

test('reconoce las causas habituales', () => {
    const cases = {
        javaTooOld: 'java.lang.UnsupportedClassVersionError: net/minecraft/client/main/Main has been compiled by a more recent version of the Java Runtime',
        javaTooNew: 'java.lang.ClassCastException: class jdk.internal.loader.ClassLoaders$AppClassLoader cannot be cast to class java.net.URLClassLoader',
        outOfMemory: 'Exception in thread "Render thread" java.lang.OutOfMemoryError: Java heap space',
        heapTooBig: 'Error occurred during initialization of VM\nCould not reserve enough space for 8388608KB object heap',
        badJvmArgs: 'Unrecognized VM option \'UseFoo\'\nError: Could not create the Java Virtual Machine.',
        duplicateMods: 'net.minecraftforge.fml.loading.DuplicateModsFoundException: Found duplicate mods',
        missingDependency: 'net.fabricmc.loader.impl.FormattedException: Mod resolution encountered an incompatible mod set!\n - Mod \'Sodium Extra\' requires any version of sodium'
    };
    for (const [code, log] of Object.entries(cases)) {
        assert.equal(analyzeCrashLog(log), code, `debería detectar ${code}`);
    }
    assert.equal(analyzeCrashLog('Missing or unsupported mandatory dependencies:\n\tMod ID: \'geckolib\''), 'missingDependency');
});

test('devuelve null si no reconoce nada', () => {
    assert.equal(analyzeCrashLog('[Render thread/INFO]: Stopping!'), null);
    assert.equal(analyzeCrashLog(''), null);
    assert.equal(analyzeCrashLog(undefined), null);
});
