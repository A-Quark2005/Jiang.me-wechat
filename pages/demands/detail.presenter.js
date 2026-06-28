function presentDemand(rawDemand, expandedApplicationId) {
  if (!rawDemand) return null;
  const applications = Array.isArray(rawDemand.applications)
    ? rawDemand.applications.map((item) => presentApplication(item, expandedApplicationId))
    : [];
  const myApplication = rawDemand.myApplication ? presentApplication(rawDemand.myApplication, '') : null;
  const organizationNames = Array.isArray(rawDemand.organizations)
    ? rawDemand.organizations.map((item) => String(item.name || '').trim()).filter(Boolean)
    : [];
  const organizationText = organizationNames.join('、');
  const applicationLimit = Number(rawDemand.applicationLimit || 1);
  const totalApplicationCount = Number(rawDemand.totalApplicationCount || 0);
  const isOpen = rawDemand.status === 'open';
  const isPoster = Boolean(rawDemand.isPoster);
  const showMyApplication = Boolean(myApplication && !isPoster);
  const showApplyControl = Boolean(!isPoster && (isOpen || showMyApplication));
  const showShareAction = Boolean(isOpen);
  const showCloseAction = Boolean(isPoster && isOpen);
  const applyActionEnabled = Boolean(rawDemand.canApply);
  const applyDisabledHint = !isPoster && !myApplication && !applyActionEnabled
    ? rawDemand.applyDisabledReason || ''
    : '';

  return {
    ...rawDemand,
    applications,
    myApplication,
    organizationText,
    hasOrganizations: organizationNames.length > 0,
    requirementText: organizationText || '无认证要求，所有人都可以投递简历',
    hasDescription: Boolean(rawDemand.description),
    hasApplications: applications.length > 0,
    totalApplicationCount,
    applicationLimit,
    candidateCountText: `已收到 ${totalApplicationCount}/${applicationLimit} 份简历`,
    overviewMetaText: `${rawDemand.amountText} / 2 小时试讲定金，收到简历后可按需查看联系方式`,
    showCandidateList: true,
    showBottomBar: Boolean(showApplyControl || showShareAction),
    showApplyControl,
    showShareAction,
    showCloseAction,
    applyActionEnabled,
    applyActionText: applyActionEnabled ? '我想试试' : (myApplication ? myApplication.statusText : (applyDisabledHint || '暂不符合要求')),
    applyDisabledHint,
    showApplyDisabledHint: Boolean(applyDisabledHint),
    shareTipText: '转发给合适的人，帮我收集更多简历',
    showMyApplication,
  };
}

function presentApplication(application, expandedApplicationId) {
  const resume = application.resume || {};
  const credentials = Array.isArray(resume.credentials) ? resume.credentials.map(presentCredential) : [];
  const engagements = Array.isArray(resume.engagements) ? resume.engagements.map(presentEngagement) : [];
  const credentialCount = credentials.length;
  const engagementCount = engagements.length;
  const expanded = application.id === expandedApplicationId;
  return {
    ...application,
    publicUserId: application.applicantUserId || resume.publicId || '',
    expanded,
    detailButtonText: expanded ? '收起' : '查看简历',
    contactButtonText: '添加好友',
    showMessage: Boolean(application.message),
    summaryText: `${credentialCount} 个认证，${engagementCount} 条履历`,
    resume: {
      ...resume,
      avatarUrlResolved: resume.avatarUrl || '/assets/ui/avatar-home.svg',
      displayNameText: resume.displayName || '未命名用户',
      selfIntroductionText: resume.selfIntroduction || '暂无自我介绍',
      credentials,
      engagements,
      hasCredentials: credentialCount > 0,
      hasEngagements: engagementCount > 0,
    },
  };
}

function presentCredential(item) {
  return {
    ...item,
    titleText: item.title || item.organizationName || '',
    metaText: item.emailMasked || item.typeLabel || '',
  };
}

function presentEngagement(item) {
  return {
    ...item,
    titleText: item.title || '服务履历',
    metaText: [item.counterpartName, item.confirmedAt ? String(item.confirmedAt).slice(0, 10) : ''].filter(Boolean).join(' · '),
    descriptionText: item.description || '',
  };
}

module.exports = {
  presentDemand,
};
