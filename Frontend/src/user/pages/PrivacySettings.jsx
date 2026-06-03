import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Download, Trash2, CheckCircle2, AlertCircle, ChevronLeft, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import useAuthStore from '../../store/authStore';
import useToastStore from '../../store/toastStore';
import { privacyService } from '../../services/privacyService';

const PrivacySettings = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { showToast } = useToastStore();
  const [loading, setLoading] = useState(true);
  const [consent, setConsent] = useState({
    marketing_emails: false,
    product_updates: true,
    usage_analytics: true,
    experimental_features: false,
  });
  const [updatingConsent, setUpdatingConsent] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [privacyRequests, setPrivacyRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [deletionReason, setDeletionReason] = useState('');
  const [showDeletionConfirm, setShowDeletionConfirm] = useState(false);

  useEffect(() => {
    if (async () => {
      if (!user?.id) return;
      try {
        const consentData = await privacyService.getConsent(user.id);
        setConsent(consentData.consent);
        const reqData = await privacyService.getPrivacyRequests(user.id);
        setPrivacyRequests(reqData.requests || []);
      } catch (err) {
        console.error('Failed to load privacy data', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const handleConsentChange = async (key, value) => {
    if (!user?.id) return;
    setConsent(prev => ({ ...prev, [key]: value }));
    setUpdatingConsent(true);
    try {
      await privacyService.updateConsent(user.id, { ...consent, [key]: value });
      showToast('Privacy preferences updated successfully', 'success');
    } catch (err) {
      showToast('Failed to update preferences', 'error');
      // Revert
      const original = await privacyService.getConsent(user.id);
      setConsent(original.consent);
    } finally {
      setUpdatingConsent(false);
    }
  };

  const handleExport = async (format) => {
    if (!user?.id) return;
    setExporting(true);
    try {
      await privacyService.exportData(user.id, format);
      showToast(`Data exported successfully as ${format.toUpperCase()}`, 'success');
    } catch (err) {
      showToast('Failed to export data', 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleDeletionRequest = async () => {
    setShowDeletionConfirm(true);
  };

  const confirmDeletionRequest = async () => {
    if (!user?.id) return;
    setRequestsLoading(true);
    try {
      const req = await privacyService.requestDeletion(user.id, deletionReason);
      setPrivacyRequests([req, ...privacyRequests]);
      showToast('Deletion request submitted', 'success');
      setShowDeletionConfirm(false);
      setDeletionReason('');
    } catch (err) {
      showToast('Failed to submit deletion request', 'error');
    } finally {
      setRequestsLoading(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-white">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f6f8f7] pb-20">
      <main className="pt-32 px-6 flex justify-center">
        <div className="w-full max-w-[1100px] flex flex-col gap-8">
          {/* Back button */}
          <button
            onClick={() => navigate('/profile')}
            className="flex items-center gap-2 text-slate-600 hover:text-emerald-600 transition-colors font-semibold"
          >
            <ChevronLeft className="w-5 h-5" />
            Back to Profile
          </button>

          {/* Privacy Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative bg-white p-8 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-white overflow-hidden"
          >
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-emerald-100 rounded-3xl flex items-center justify-center text-emerald-600">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <div>
                <h1 className="text-3xl font-black text-slate-900 italic">Privacy & Data Controls</h1>
                <p className="text-slate-500">Manage your personal data and consent preferences</p>
              </div>
            </div>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Consent Settings */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Card className="border-none shadow-xl shadow-slate-200/40 rounded-[2.5rem] bg-white h-full">
                <CardHeader className="p-8 pb-4 bg-slate-50/50">
                  <CardTitle className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2 italic">
                    Consent Preferences
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-8 space-y-6">
                  {[
                    {
                      key: 'marketing_emails',
                      label: 'Marketing Emails',
                      desc: 'Receive promotional emails and offers',
                    },
                    {
                      key: 'product_updates',
                      label: 'Product Updates',
                      desc: 'Get notified about new features and improvements',
                    },
                    {
                      key: 'usage_analytics',
                      label: 'Usage Analytics',
                      desc: 'Allow anonymous usage data to improve the product',
                    },
                    {
                      key: 'experimental_features',
                      label: 'Experimental Features',
                      desc: 'Participate in early access tests',
                    },
                  ].map((item) => (
                    <div
                      key={item.key}
                      className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100/50"
                    >
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                        <p className="text-xs text-slate-500">{item.desc}</p>
                      </div>
                      <button
                        onClick={() => handleConsentChange(item.key, !consent[item.key])}
                        disabled={updatingConsent}
                        className={`w-14 h-7 rounded-full transition-colors relative ${
                          consent[item.key] ? 'bg-emerald-500' : 'bg-slate-300'
                        }`}
                      >
                        <div
                          className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform ${
                            consent[item.key] ? 'translate-x-7' : ''
                          }`}
                        />
                      </button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </motion.div>

            {/* Data Actions */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Card className="border-none shadow-xl shadow-slate-200/40 rounded-[2.5rem] bg-white h-full">
                <CardHeader className="p-8 pb-4 bg-slate-50/50">
                  <CardTitle className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2 italic">
                    Data Management
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-8 space-y-6">
                  {/* Export Data */}
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100/50">
                    <p className="text-sm font-semibold text-slate-900 mb-2">Download Your Data</p>
                    <p className="text-xs text-slate-500 mb-4">
                      Export all your personal data and ticket history
                    </p>
                    <div className="flex gap-3">
                      <Button
                        onClick={() => handleExport('json')}
                        disabled={exporting}
                        className="rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-semibold"
                      >
                        {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                        {exporting ? 'Exporting...' : 'JSON'}
                      </Button>
                      <Button
                        onClick={() => handleExport('csv')}
                        disabled={exporting}
                        className="rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-900 font-semibold"
                      >
                        {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                        CSV
                      </Button>
                    </div>
                  </div>

                  {/* Request Deletion */}
                  <div className="p-4 bg-red-50 rounded-2xl border border-red-100">
                    <p className="text-sm font-semibold text-red-700 mb-2 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      Delete Account
                    </p>
                    <p className="text-xs text-red-600 mb-4">
                      Request permanent deletion of your account and personal data
                    </p>
                    <Button
                      onClick={handleDeletionRequest}
                      className="rounded-2xl bg-red-600 hover:bg-red-700 text-white font-semibold"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Request Deletion
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Privacy Requests History */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="md:col-span-2"
            >
              <Card className="border-none shadow-xl shadow-slate-200/40 rounded-[2.5rem] bg-white">
                <CardHeader className="p-8 pb-4 bg-slate-50/50">
                  <CardTitle className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2 italic">
                    Privacy Request History
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-8">
                  {privacyRequests.length === 0 ? (
                    <div className="text-center py-10 text-slate-500">
                      <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-emerald-500 opacity-50" />
                      No privacy requests yet
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {privacyRequests.map((req, idx) => (
                        <div
                          key={idx}
                          className="p-4 bg-slate-50 rounded-2xl border border-slate-100/50"
                        >
                          <div className="flex justify-between items-center">
                            <div>
                              <p className="text-sm font-semibold text-slate-900 capitalize">
                                {req.type} Request
                              </p>
                              <p className="text-xs text-slate-500">
                                {new Date(req.requested_at || req.created_at).toLocaleDateString()}
                              </p>
                            </div>
                            <span
                              className={`text-xs font-black px-3 py-1 rounded-full uppercase tracking-wider ${
                                req.status === 'pending'
                                  ? 'bg-amber-100 text-amber-700'
                                  : req.status === 'completed'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {req.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </main>

      {/* Deletion Confirmation Modal */}
      {showDeletionConfirm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl overflow-hidden"
          >
            <div className="px-8 py-6 bg-red-600 text-white flex items-center justify-between">
              <h3 className="font-black italic uppercase text-sm tracking-widest">
                Confirm Deletion Request
              </h3>
            </div>
            <div className="p-8 space-y-4">
              <p className="text-sm text-slate-600">
                Are you sure you want to request account deletion? This will erase your
                data will be scheduled for deletion.
              </p>
              <textarea
                value={deletionReason}
                onChange={(e) => setDeletionReason(e.target.value)}
                placeholder="Optional: Reason for leaving"
                className="w-full bg-slate-50 border-2 border-transparent focus:border-red-500 px-4 py-3 rounded-2xl text-sm font-bold outline-none transition-all"
              />
              <div className="flex gap-3 pt-2">
                <Button
                  onClick={() => setShowDeletionConfirm(false)}
                  className="flex-1 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-900 font-semibold"
                >
                  Cancel
                </Button>
                <Button
                  onClick={confirmDeletionRequest}
                  disabled={requestsLoading}
                  className="flex-1 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-semibold"
                >
                  {requestsLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Confirm Request
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default PrivacySettings;
