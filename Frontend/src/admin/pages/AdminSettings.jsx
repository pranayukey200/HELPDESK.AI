import React, { useEffect, useMemo, useState } from 'react';
import {
    Activity,
    Bell,
    CheckCircle2,
    Copy,
    Cpu,
    Globe2,
    Inbox,
    KeyRound,
    Loader2,
    Plus,
    Save,
    Settings,
    ShieldCheck,
    ShieldEllipsis,
    Users,
    X,
} from 'lucide-react';
import useAdminStore from '../store/adminStore';
import useAuthStore from '../../store/authStore';
import { enterpriseAuthService } from '../services/enterpriseAuthService';
import { Card, CardContent } from "../../components/ui/card";
import { Select } from "../../components/ui/select";

const roleOptions = [
    { value: "user", label: "User" },
    { value: "admin", label: "Admin" },
    { value: "super_admin", label: "Super Admin" },
];

const scopeOptions = [
    { value: "requester_access", label: "Requester Access" },
    { value: "ticket_management", label: "Ticket Management" },
    { value: "directory_admin", label: "Directory Admin" },
];

const toggleColorClasses = {
    emerald: 'bg-emerald-600',
    indigo: 'bg-indigo-600',
};

const sessionTimeoutOptions = [
    { value: 60, label: "1 Hour" },
    { value: 240, label: "4 Hours" },
    { value: 480, label: "8 Hours" },
    { value: 720, label: "12 Hours" },
];

const SectionToggle = ({ title, description, enabled, onToggle, accent = "indigo" }) => (
    <div className="flex items-center justify-between gap-6 py-4 border-b border-slate-100 last:border-b-0">
        <div>
            <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest">{title}</h4>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">{description}</p>
        </div>
        <button
            type="button"
            onClick={onToggle}
            className={`w-14 h-8 rounded-full relative transition-all duration-300 shadow-inner shrink-0 ${enabled ? (toggleColorClasses[accent] || toggleColorClasses.indigo) : 'bg-slate-200'}`}
        >
            <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all duration-300 shadow-md ${enabled ? 'right-1' : 'left-1'}`}></div>
        </button>
    </div>
);

const AdminSettings = () => {
    const { settings, updateSettings } = useAdminStore();
    const { profile } = useAuthStore();
    const companyId = profile?.company_id || 'default-company';
    const actor = profile?.email || 'admin';

    const [enterpriseConfig, setEnterpriseConfig] = useState(enterpriseAuthService.defaultConfig);
    const [auditEvents, setAuditEvents] = useState([]);
    const [loadingSSO, setLoadingSSO] = useState(true);
    const [savingSSO, setSavingSSO] = useState(false);
    const [ssoStatus, setSSOStatus] = useState('');
    const [providerChecks, setProviderChecks] = useState({});
    const [copiedSecret, setCopiedSecret] = useState(false);

    useEffect(() => {
        let ignore = false;

        const loadEnterpriseConfig = async () => {
            setLoadingSSO(true);
            const payload = await enterpriseAuthService.getConfig(companyId);
            if (ignore) return;
            setEnterpriseConfig(payload.config);
            setAuditEvents(payload.auditEvents || []);
            setLoadingSSO(false);
        };

        loadEnterpriseConfig();

        return () => {
            ignore = true;
        };
    }, [companyId]);

    const enabledProviderCount = useMemo(
        () => enterpriseConfig.providers.filter((provider) => provider.enabled).length,
        [enterpriseConfig.providers]
    );

    const handleChange = (key, value) => {
        updateSettings({ [key]: value });
    };

    const updateEnterpriseConfig = (updater) => {
        setEnterpriseConfig((current) => (typeof updater === 'function' ? updater(current) : updater));
        setSSOStatus('');
    };

    const handleEnterpriseFieldChange = (key, value) => {
        updateEnterpriseConfig((current) => ({ ...current, [key]: value }));
    };

    const handleProviderChange = (providerId, key, value) => {
        updateEnterpriseConfig((current) => ({
            ...current,
            providers: current.providers.map((provider) =>
                provider.id === providerId ? { ...provider, [key]: value } : provider
            ),
        }));
    };

    const handleRoleMappingChange = (mappingId, key, value) => {
        updateEnterpriseConfig((current) => ({
            ...current,
            roleMappings: current.roleMappings.map((mapping) =>
                mapping.id === mappingId ? { ...mapping, [key]: value } : mapping
            ),
        }));
    };

    const addRoleMapping = () => {
        updateEnterpriseConfig((current) => ({
            ...current,
            roleMappings: [
                ...current.roleMappings,
                {
                    id: `mapping-${Date.now()}`,
                    externalGroup: '',
                    role: 'user',
                    scope: 'requester_access',
                },
            ],
        }));
    };

    const removeRoleMapping = (mappingId) => {
        updateEnterpriseConfig((current) => ({
            ...current,
            roleMappings: current.roleMappings.filter((mapping) => mapping.id !== mappingId),
        }));
    };

    const saveEnterpriseSettings = async () => {
        setSavingSSO(true);
        setSSOStatus('');
        try {
            const payload = await enterpriseAuthService.saveConfig(companyId, enterpriseConfig, actor);
            setEnterpriseConfig(payload.config);
            setAuditEvents(payload.auditEvents || []);
            setSSOStatus('Enterprise authentication settings saved.');
        } catch (error) {
            setSSOStatus(error.message || 'Failed to save enterprise authentication settings.');
        } finally {
            setSavingSSO(false);
        }
    };

    const runProviderTest = async (providerId) => {
        setProviderChecks((current) => ({
            ...current,
            [providerId]: { status: 'running', message: 'Running diagnostics...', checks: [] },
        }));

        const result = await enterpriseAuthService.testProvider(companyId, providerId);
        setProviderChecks((current) => ({
            ...current,
            [providerId]: result,
        }));
    };

    const copyWebhookSecret = async () => {
        if (!enterpriseConfig.provisioningWebhookSecret) return;
        try {
            await navigator.clipboard.writeText(enterpriseConfig.provisioningWebhookSecret);
            setCopiedSecret(true);
            setTimeout(() => setCopiedSecret(false), 1600);
        } catch {
            setCopiedSecret(false);
        }
    };

    return (
        <div className="max-w-5xl mx-auto py-6 space-y-10 pb-20 animate-in fade-in duration-700">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight italic uppercase flex items-center gap-3">
                        <Settings size={28} className="text-indigo-600" /> Settings
                    </h1>
                    <p className="text-sm font-bold text-slate-400 mt-1 flex items-center gap-2 uppercase tracking-[0.2em]">
                        <ShieldCheck size={14} className="text-emerald-500" /> Administrator Account
                    </p>
                </div>
                <button
                    type="button"
                    onClick={saveEnterpriseSettings}
                    disabled={savingSSO || loadingSSO}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 text-white px-5 py-3 text-sm font-black uppercase tracking-[0.2em] shadow-lg shadow-slate-200 disabled:opacity-60"
                >
                    {savingSSO ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Save Enterprise Auth
                </button>
            </div>

            <div className="space-y-8">
                <Card className="border-none shadow-2xl shadow-slate-200/40 rounded-[2rem] overflow-hidden bg-white">
                    <div className="px-8 py-6 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
                        <h3 className="text-sm font-black uppercase italic tracking-tight flex items-center gap-3">
                            <Cpu size={18} className="text-indigo-400" /> AI Settings
                        </h3>
                    </div>
                    <CardContent className="p-8 space-y-8">
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <label className="text-xs font-black text-slate-700 uppercase tracking-widest">
                                    AI Confidence Threshold (<span className="text-indigo-600">{(settings.aiConfidenceThreshold * 100).toFixed(0)}%</span>)
                                </label>
                            </div>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest max-w-lg mb-2">
                                Minimum confidence required for AI to process and categorize tickets automatically.
                            </p>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                value={settings.aiConfidenceThreshold}
                                onChange={(e) => handleChange('aiConfidenceThreshold', parseFloat(e.target.value))}
                                className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                            />
                        </div>

                        <div className="space-y-4 pt-4 border-t border-slate-100">
                            <div className="flex justify-between items-center">
                                <label className="text-xs font-black text-slate-700 uppercase tracking-widest">
                                    Duplicate Detection (<span className="text-indigo-600">{(settings.duplicateSensitivity * 100).toFixed(0)}%</span>)
                                </label>
                            </div>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest max-w-lg mb-2">
                                Semantic similarity score needed to flag incoming tickets as duplicates.
                            </p>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                value={settings.duplicateSensitivity}
                                onChange={(e) => handleChange('duplicateSensitivity', parseFloat(e.target.value))}
                                className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                            />
                        </div>

                        <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                            <div>
                                <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest">Enable Auto Resolve</h4>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Allow AI to close easily solved requests.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => handleChange('enableAutoResolve', !settings.enableAutoResolve)}
                                className={`w-14 h-8 rounded-full relative transition-all duration-300 shadow-inner shrink-0 ${settings.enableAutoResolve ? 'bg-indigo-600' : 'bg-slate-200'}`}
                            >
                                <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all duration-300 shadow-md ${settings.enableAutoResolve ? 'right-1' : 'left-1'}`}></div>
                            </button>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-none shadow-2xl shadow-slate-200/40 rounded-[2rem] overflow-hidden bg-white">
                    <div className="px-8 py-6 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                        <h3 className="text-sm font-black text-slate-900 uppercase italic tracking-tight flex items-center gap-3">
                            <Inbox size={18} className="text-emerald-500" /> Ticket Settings
                        </h3>
                    </div>
                    <CardContent className="p-8 space-y-6">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                            <div>
                                <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest">Auto-Close Tickets</h4>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Automatically archive resolved tickets after inactivity.</p>
                            </div>
                            <Select
                                value={settings.autoCloseDays}
                                onChange={(e) => handleChange('autoCloseDays', parseInt(e.target.value))}
                                className="w-full md:w-auto"
                                buttonClassName="w-full md:w-auto min-w-[140px] bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-black text-slate-700 uppercase outline-none focus:border-indigo-600 transition-colors flex justify-between items-center"
                                options={[
                                    { value: 3, label: "3 Days" },
                                    { value: 7, label: "7 Days" },
                                    { value: 14, label: "14 Days" }
                                ]}
                            />
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-none shadow-2xl shadow-slate-200/40 rounded-[2rem] overflow-hidden bg-white">
                    <div className="px-8 py-6 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                        <h3 className="text-sm font-black text-slate-900 uppercase italic tracking-tight flex items-center gap-3">
                            <Bell size={18} className="text-amber-500" /> Notifications
                        </h3>
                    </div>
                    <CardContent className="p-8 space-y-6">
                        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                            <div>
                                <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest">Email Notifications</h4>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Receive daily system digests via email.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => handleChange('emailNotifications', !settings.emailNotifications)}
                                className={`w-14 h-8 rounded-full relative transition-all duration-300 shadow-inner shrink-0 ${settings.emailNotifications ? 'bg-amber-500' : 'bg-slate-200'}`}
                            >
                                <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all duration-300 shadow-md ${settings.emailNotifications ? 'right-1' : 'left-1'}`}></div>
                            </button>
                        </div>

                        <div className="flex items-center justify-between">
                            <div>
                                <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest">Critical Admin Alerts</h4>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Push notifications for Priority 1 system events.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => handleChange('adminAlerts', !settings.adminAlerts)}
                                className={`w-14 h-8 rounded-full relative transition-all duration-300 shadow-inner shrink-0 ${settings.adminAlerts ? 'bg-amber-500' : 'bg-slate-200'}`}
                            >
                                <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all duration-300 shadow-md ${settings.adminAlerts ? 'right-1' : 'left-1'}`}></div>
                            </button>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-none shadow-2xl shadow-slate-200/40 rounded-[2rem] overflow-hidden bg-white">
                    <div className="px-8 py-6 bg-emerald-950 text-white flex items-center justify-between border-b border-emerald-900">
                        <div>
                            <h3 className="text-sm font-black uppercase italic tracking-tight flex items-center gap-3">
                                <ShieldEllipsis size={18} className="text-emerald-300" /> Enterprise Authentication
                            </h3>
                            <p className="mt-2 text-xs text-emerald-100/80 uppercase tracking-[0.18em]">
                                {enabledProviderCount} provider{enabledProviderCount === 1 ? '' : 's'} enabled
                            </p>
                        </div>
                        <div className="rounded-full bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em]">
                            Company: {companyId}
                        </div>
                    </div>
                    <CardContent className="p-8 space-y-8">
                        {loadingSSO ? (
                            <div className="flex items-center gap-3 text-sm font-semibold text-slate-500">
                                <Loader2 size={18} className="animate-spin" />
                                Loading enterprise authentication settings...
                            </div>
                        ) : (
                            <>
                                {ssoStatus && (
                                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                                        {ssoStatus}
                                    </div>
                                )}

                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                                    <div className="rounded-[1.5rem] border border-slate-200 p-6 bg-slate-50/80">
                                        <div className="flex items-start gap-4">
                                            <div className="rounded-2xl bg-emerald-100 p-3">
                                                <ShieldCheck size={20} className="text-emerald-700" />
                                            </div>
                                            <div className="flex-1">
                                                <h4 className="text-sm font-black uppercase tracking-[0.16em] text-slate-900">Suite Controls</h4>
                                                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400 mt-2">
                                                    Turn enterprise SSO on, keep safe fallback paths, and define how new identities land in the system.
                                                </p>
                                            </div>
                                        </div>

                                        <div className="mt-6">
                                            <SectionToggle
                                                title="Enterprise SSO Enabled"
                                                description="Expose enterprise identity providers on the sign-in journey."
                                                enabled={enterpriseConfig.enabled}
                                                onToggle={() => handleEnterpriseFieldChange('enabled', !enterpriseConfig.enabled)}
                                                accent="emerald"
                                            />
                                            <SectionToggle
                                                title="Email + Password Fallback"
                                                description="Keep standard credentials available during rollout or incidents."
                                                enabled={enterpriseConfig.allowEmailPasswordFallback}
                                                onToggle={() => handleEnterpriseFieldChange('allowEmailPasswordFallback', !enterpriseConfig.allowEmailPasswordFallback)}
                                                accent="emerald"
                                            />
                                            <SectionToggle
                                                title="Magic Link Fallback"
                                                description="Allow passwordless fallback for users not yet moved to SSO."
                                                enabled={enterpriseConfig.allowMagicLinkFallback}
                                                onToggle={() => handleEnterpriseFieldChange('allowMagicLinkFallback', !enterpriseConfig.allowMagicLinkFallback)}
                                                accent="emerald"
                                            />
                                            <SectionToggle
                                                title="Just-In-Time Provisioning"
                                                description="Create users automatically the first time they sign in from the IdP."
                                                enabled={enterpriseConfig.jitProvisioning}
                                                onToggle={() => handleEnterpriseFieldChange('jitProvisioning', !enterpriseConfig.jitProvisioning)}
                                                accent="emerald"
                                            />
                                        </div>
                                    </div>

                                    <div className="rounded-[1.5rem] border border-slate-200 p-6 bg-white">
                                        <div className="flex items-start gap-4">
                                            <div className="rounded-2xl bg-indigo-100 p-3">
                                                <Users size={20} className="text-indigo-700" />
                                            </div>
                                            <div className="flex-1">
                                                <h4 className="text-sm font-black uppercase tracking-[0.16em] text-slate-900">Provisioning + Sync</h4>
                                                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400 mt-2">
                                                    Define how groups map into roles and how long enterprise sessions should stay active.
                                                </p>
                                            </div>
                                        </div>

                                        <div className="mt-6 space-y-5">
                                            <SectionToggle
                                                title="Group Sync Enabled"
                                                description="Apply group-to-role mappings during sign-in and refresh cycles."
                                                enabled={enterpriseConfig.groupSyncEnabled}
                                                onToggle={() => handleEnterpriseFieldChange('groupSyncEnabled', !enterpriseConfig.groupSyncEnabled)}
                                            />
                                            <SectionToggle
                                                title="Nested Groups"
                                                description="Resolve inherited memberships from nested enterprise directories."
                                                enabled={enterpriseConfig.nestedGroupsEnabled}
                                                onToggle={() => handleEnterpriseFieldChange('nestedGroupsEnabled', !enterpriseConfig.nestedGroupsEnabled)}
                                            />

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                                                <div>
                                                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400 mb-2">Default Role</p>
                                                    <Select
                                                        value={enterpriseConfig.defaultRole}
                                                        onChange={(e) => handleEnterpriseFieldChange('defaultRole', e.target.value)}
                                                        options={roleOptions}
                                                    />
                                                </div>
                                                <div>
                                                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400 mb-2">Session Timeout</p>
                                                    <Select
                                                        value={enterpriseConfig.sessionTimeoutMinutes}
                                                        onChange={(e) => handleEnterpriseFieldChange('sessionTimeoutMinutes', parseInt(e.target.value))}
                                                        options={sessionTimeoutOptions}
                                                    />
                                                </div>
                                            </div>

                                            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
                                                <div className="flex items-center justify-between gap-4">
                                                    <div>
                                                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Provisioning Webhook Secret</p>
                                                        <p className="mt-2 text-sm font-semibold text-slate-700 break-all">
                                                            {enterpriseConfig.provisioningWebhookSecret || 'Will be generated on save'}
                                                        </p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={copyWebhookSecret}
                                                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black uppercase tracking-[0.16em] text-slate-700"
                                                    >
                                                        {copiedSecret ? <CheckCircle2 size={14} className="text-emerald-600" /> : <Copy size={14} />}
                                                        {copiedSecret ? 'Copied' : 'Copy'}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-5">
                                    <div className="flex items-center justify-between gap-4">
                                        <div>
                                            <h4 className="text-sm font-black uppercase tracking-[0.16em] text-slate-900 flex items-center gap-3">
                                                <Globe2 size={18} className="text-emerald-600" /> Identity Providers
                                            </h4>
                                            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400 mt-2">
                                                Configure each IdP independently and run diagnostics before rollout.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                                        {enterpriseConfig.providers.map((provider) => {
                                            const testState = providerChecks[provider.id];
                                            const isSaml = provider.protocol === 'saml2';
                                            const isOidc = provider.protocol === 'oidc';

                                            return (
                                                <div key={provider.id} className="rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-sm">
                                                    <div className="flex items-start justify-between gap-4">
                                                        <div>
                                                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{provider.protocol}</p>
                                                            <h5 className="mt-2 text-lg font-black text-slate-900">{provider.name}</h5>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleProviderChange(provider.id, 'enabled', !provider.enabled)}
                                                            className={`rounded-full px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] ${provider.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
                                                        >
                                                            {provider.enabled ? 'Enabled' : 'Disabled'}
                                                        </button>
                                                    </div>

                                                    <div className="mt-5 grid grid-cols-1 gap-4">
                                                        <div>
                                                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400 mb-2">Button Label</p>
                                                            <input
                                                                value={provider.buttonLabel || ''}
                                                                onChange={(e) => handleProviderChange(provider.id, 'buttonLabel', e.target.value)}
                                                                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-500"
                                                                placeholder="Continue with corporate SSO"
                                                            />
                                                        </div>

                                                        {!isSaml && (
                                                            <div>
                                                                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400 mb-2">Client ID</p>
                                                                <input
                                                                    value={provider.clientId || ''}
                                                                    onChange={(e) => handleProviderChange(provider.id, 'clientId', e.target.value)}
                                                                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-500"
                                                                    placeholder="app-client-id"
                                                                />
                                                            </div>
                                                        )}

                                                        {isSaml && (
                                                            <div>
                                                                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400 mb-2">Metadata URL</p>
                                                                <input
                                                                    value={provider.metadataUrl || ''}
                                                                    onChange={(e) => handleProviderChange(provider.id, 'metadataUrl', e.target.value)}
                                                                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-500"
                                                                    placeholder="https://idp.example.com/metadata"
                                                                />
                                                            </div>
                                                        )}

                                                        {isOidc && (
                                                            <div>
                                                                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400 mb-2">OIDC Discovery URL</p>
                                                                <input
                                                                    value={provider.discoveryUrl || ''}
                                                                    onChange={(e) => handleProviderChange(provider.id, 'discoveryUrl', e.target.value)}
                                                                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-500"
                                                                    placeholder="https://login.microsoftonline.com/.../.well-known/openid-configuration"
                                                                />
                                                            </div>
                                                        )}

                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                            <div>
                                                                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400 mb-2">Domain Hint</p>
                                                                <input
                                                                    value={provider.domainHint || ''}
                                                                    onChange={(e) => handleProviderChange(provider.id, 'domainHint', e.target.value)}
                                                                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-500"
                                                                    placeholder="company.com"
                                                                />
                                                            </div>
                                                            <div className="flex items-end">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleProviderChange(provider.id, 'clientSecretConfigured', !provider.clientSecretConfigured)}
                                                                    className={`w-full rounded-xl px-4 py-3 text-sm font-black uppercase tracking-[0.16em] ${provider.clientSecretConfigured ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}
                                                                >
                                                                    {provider.clientSecretConfigured ? 'Secret Added' : 'Mark Secret Added'}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="mt-5 flex items-center gap-3">
                                                        <button
                                                            type="button"
                                                            onClick={() => runProviderTest(provider.id)}
                                                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black uppercase tracking-[0.16em] text-slate-700"
                                                        >
                                                            {testState?.status === 'running' ? <Loader2 size={14} className="animate-spin" /> : <Activity size={14} />}
                                                            Run Diagnostics
                                                        </button>
                                                        {provider.supabaseProvider && (
                                                            <div className="rounded-xl bg-slate-100 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                                                                Login Button Supported
                                                            </div>
                                                        )}
                                                    </div>

                                                    {testState && testState.status !== 'running' && (
                                                        <div className={`mt-4 rounded-2xl border px-4 py-3 ${testState.status === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                                                            <p className="text-sm font-bold">{testState.message}</p>
                                                            {testState.checks?.length > 0 && (
                                                                <div className="mt-2 space-y-1">
                                                                    {testState.checks.map((check, index) => (
                                                                        <p key={`${provider.id}-check-${index}`} className="text-xs font-semibold">
                                                                            {check}
                                                                        </p>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-6">
                                    <div className="rounded-[1.5rem] border border-slate-200 bg-white p-6">
                                        <div className="flex items-center justify-between gap-4">
                                            <div>
                                                <h4 className="text-sm font-black uppercase tracking-[0.16em] text-slate-900 flex items-center gap-3">
                                                    <Users size={18} className="text-indigo-600" /> Group Role Mappings
                                                </h4>
                                                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400 mt-2">
                                                    Sync upstream directory groups into app roles without manual admin work.
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={addRoleMapping}
                                                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black uppercase tracking-[0.16em] text-white"
                                            >
                                                <Plus size={14} /> Add Mapping
                                            </button>
                                        </div>

                                        <div className="mt-5 space-y-4">
                                            {enterpriseConfig.roleMappings.map((mapping) => (
                                                <div key={mapping.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                                    <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_0.8fr_0.9fr_auto] gap-3 items-end">
                                                        <div>
                                                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400 mb-2">External Group</p>
                                                            <input
                                                                value={mapping.externalGroup}
                                                                onChange={(e) => handleRoleMappingChange(mapping.id, 'externalGroup', e.target.value)}
                                                                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-indigo-500"
                                                                placeholder="IT Administrators"
                                                            />
                                                        </div>
                                                        <div>
                                                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400 mb-2">Role</p>
                                                            <Select
                                                                value={mapping.role}
                                                                onChange={(e) => handleRoleMappingChange(mapping.id, 'role', e.target.value)}
                                                                options={roleOptions}
                                                            />
                                                        </div>
                                                        <div>
                                                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400 mb-2">Scope</p>
                                                            <Select
                                                                value={mapping.scope}
                                                                onChange={(e) => handleRoleMappingChange(mapping.id, 'scope', e.target.value)}
                                                                options={scopeOptions}
                                                            />
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => removeRoleMapping(mapping.id)}
                                                            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-3 text-slate-500 hover:text-red-600"
                                                        >
                                                            <X size={16} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="rounded-[1.5rem] border border-slate-200 bg-white p-6">
                                        <h4 className="text-sm font-black uppercase tracking-[0.16em] text-slate-900 flex items-center gap-3">
                                            <KeyRound size={18} className="text-amber-500" /> Auth Activity
                                        </h4>
                                        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400 mt-2">
                                            Recent configuration and provider validation events.
                                        </p>

                                        <div className="mt-5 space-y-3">
                                            {auditEvents.length === 0 ? (
                                                <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm font-semibold text-slate-500">
                                                    No audit events yet.
                                                </div>
                                            ) : (
                                                auditEvents.map((event) => (
                                                    <div key={event.id} className="rounded-2xl border border-slate-200 p-4">
                                                        <div className="flex items-start justify-between gap-4">
                                                            <div>
                                                                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{event.event}</p>
                                                                <p className="mt-2 text-sm font-semibold text-slate-800">{event.message}</p>
                                                            </div>
                                                            <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${event.level === 'success' ? 'bg-emerald-100 text-emerald-700' : event.level === 'warning' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                                                                {event.level}
                                                            </span>
                                                        </div>
                                                        <div className="mt-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                                                            {event.actor || 'system'} • {new Date(event.createdAt).toLocaleString()}
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default AdminSettings;
