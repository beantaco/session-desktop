import React from 'react';
import { connect } from 'react-redux';
import { SessionIconButton, SessionIconSize, SessionIconType } from './icon';
import { Avatar } from '../Avatar';
import { darkTheme, lightTheme } from '../../state/ducks/SessionTheme';
import { SessionToastContainer } from './SessionToastContainer';
import { mapDispatchToProps } from '../../state/actions';
import { ConversationType } from '../../state/ducks/conversations';
import { DefaultTheme } from 'styled-components';
import { StateType } from '../../state/reducer';
import { ConversationController } from '../../session/conversations';
import { getFocusedSection } from '../../state/selectors/section';
import { getTheme } from '../../state/selectors/theme';
import { getOurNumber } from '../../state/selectors/user';
import { UserUtils } from '../../session/utils';
import { syncConfigurationIfNeeded } from '../../session/utils/syncUtils';
import { DAYS } from '../../session/utils/Number';
import {
  getItemById,
  hasSyncedInitialConfigurationItem,
  removeItemById,
} from '../../data/data';
import { OnionPaths } from '../../session/onions';
import { getMessageQueue } from '../../session/sending';
import { clearSessionsAndPreKeys } from '../../util/accountManager';
// tslint:disable-next-line: no-import-side-effect no-submodule-imports

export enum SectionType {
  Profile,
  Message,
  Contact,
  Channel,
  Settings,
  Moon,
}

interface Props {
  onSectionSelected: any;
  selectedSection: SectionType;
  unreadMessageCount: number;
  ourPrimaryConversation: ConversationType;
  ourNumber: string;
  applyTheme?: any;
  theme: DefaultTheme;
}

/**
 * ActionsPanel is the far left banner (not the left pane).
 * The panel with buttons to switch between the message/contact/settings/theme views
 */
class ActionsPanelPrivate extends React.Component<Props> {
  private syncInterval: NodeJS.Timeout | null = null;

  constructor(props: Props) {
    super(props);

    // we consider people had the time to upgrade, so remove this id from the db
    // it was used to display a dialog when we added the light mode auto-enabled
    void removeItemById('hasSeenLightModeDialog');
  }

  // fetch the user saved theme from the db, and apply it on mount.
  public componentDidMount() {
    void window.setClockParams();
    if (
      window.lokiFeatureFlags.useOnionRequests ||
      window.lokiFeatureFlags.useFileOnionRequests
    ) {
      // Initialize paths for onion requests
      void OnionPaths.getInstance().buildNewOnionPaths();
    }

    // This is not ideal, but on the restore from seed, our conversation will be created before the
    // redux store is ready.
    // If that's the case, the save events on our conversation won't be triggering redux updates.
    // So changes to our conversation won't make a change on the UI.
    // Calling this makes sure that our own conversation is registered to redux.
    ConversationController.getInstance().registerAllConvosToRedux();

    // init the messageQueue. In the constructor, we had all not send messages
    // this call does nothing except calling the constructor, which will continue sending message in the pipeline
    void getMessageQueue().processAllPending();

    const theme = window.Events.getThemeSetting();
    window.setTheme(theme);

    const newThemeObject = theme === 'dark' ? darkTheme : lightTheme;
    this.props.applyTheme(newThemeObject);

    void this.showResetSessionIDDialogIfNeeded();

    // remove existing prekeys, sign prekeys and sessions
    void clearSessionsAndPreKeys();

    // Do this only if we created a new Session ID, or if we already received the initial configuration message

    const syncConfiguration = async () => {
      const didWeHandleAConfigurationMessageAlready =
        (await getItemById(hasSyncedInitialConfigurationItem))?.value || false;
      if (didWeHandleAConfigurationMessageAlready) {
        await syncConfigurationIfNeeded();
      }
    };

    // trigger a sync message if needed for our other devices

    void syncConfiguration();

    this.syncInterval = global.setInterval(() => {
      void syncConfigurationIfNeeded();
    }, DAYS * 2);
  }

  public componentWillUnmount() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  public Section = ({
    isSelected,
    onSelect,
    type,
    avatarPath,
    notificationCount,
  }: {
    isSelected: boolean;
    onSelect?: (event: SectionType) => void;
    type: SectionType;
    avatarPath?: string;
    notificationCount?: number;
  }) => {
    const { ourNumber } = this.props;
    const handleClick = onSelect
      ? () => {
          /* tslint:disable:no-void-expression */
          if (type === SectionType.Profile) {
            window.showEditProfileDialog();
          } else if (type === SectionType.Moon) {
            const theme = window.Events.getThemeSetting();
            const updatedTheme = theme === 'dark' ? 'light' : 'dark';
            window.setTheme(updatedTheme);

            const newThemeObject =
              updatedTheme === 'dark' ? darkTheme : lightTheme;
            this.props.applyTheme(newThemeObject);
          } else {
            onSelect(type);
          }
          /* tslint:enable:no-void-expression */
        }
      : undefined;

    if (type === SectionType.Profile) {
      const conversation = ConversationController.getInstance().get(ourNumber);

      const profile = conversation?.getLokiProfile();
      const userName = (profile && profile.displayName) || ourNumber;
      return (
        <Avatar
          avatarPath={avatarPath}
          size={28}
          onAvatarClick={handleClick}
          name={userName}
          pubkey={ourNumber}
        />
      );
    }

    let iconType: SessionIconType;
    switch (type) {
      case SectionType.Message:
        iconType = SessionIconType.ChatBubble;
        break;
      case SectionType.Contact:
        iconType = SessionIconType.Users;
        break;
      case SectionType.Channel:
        iconType = SessionIconType.Globe;
        break;
      case SectionType.Settings:
        iconType = SessionIconType.Gear;
        break;
      case SectionType.Moon:
        iconType = SessionIconType.Moon;
        break;

      default:
        iconType = SessionIconType.Moon;
    }

    return (
      <SessionIconButton
        iconSize={SessionIconSize.Medium}
        iconType={iconType}
        notificationCount={notificationCount}
        onClick={handleClick}
        isSelected={isSelected}
        theme={this.props.theme}
      />
    );
  };

  public render(): JSX.Element {
    const {
      selectedSection,
      unreadMessageCount,
      ourPrimaryConversation,
    } = this.props;

    if (!ourPrimaryConversation) {
      window.log.warn('ActionsPanel: ourPrimaryConversation is not set');
      return <></>;
    }

    const isProfilePageSelected = selectedSection === SectionType.Profile;
    const isMessagePageSelected = selectedSection === SectionType.Message;
    const isContactPageSelected = selectedSection === SectionType.Contact;
    const isSettingsPageSelected = selectedSection === SectionType.Settings;
    const isMoonPageSelected = selectedSection === SectionType.Moon;

    return (
      <div className="module-left-pane__sections-container">
        <this.Section
          type={SectionType.Profile}
          avatarPath={ourPrimaryConversation.avatarPath}
          isSelected={isProfilePageSelected}
          onSelect={this.handleSectionSelect}
        />
        <this.Section
          type={SectionType.Message}
          isSelected={isMessagePageSelected}
          onSelect={this.handleSectionSelect}
          notificationCount={unreadMessageCount}
        />
        <this.Section
          type={SectionType.Contact}
          isSelected={isContactPageSelected}
          onSelect={this.handleSectionSelect}
        />
        <this.Section
          type={SectionType.Settings}
          isSelected={isSettingsPageSelected}
          onSelect={this.handleSectionSelect}
        />

        <SessionToastContainer />
        <this.Section
          type={SectionType.Moon}
          isSelected={isMoonPageSelected}
          onSelect={this.handleSectionSelect}
        />
      </div>
    );
  }

  private readonly handleSectionSelect = (section: SectionType): void => {
    this.props.onSectionSelected(section);
  };

  private async showResetSessionIDDialogIfNeeded() {
    const userED25519KeyPairHex = await UserUtils.getUserED25519KeyPair();
    if (userED25519KeyPairHex) {
      return;
    }

    window.showResetSessionIdDialog();
  }
}

const mapStateToProps = (state: StateType) => {
  return {
    section: getFocusedSection(state),
    theme: getTheme(state),
    ourNumber: getOurNumber(state),
  };
};

const smart = connect(mapStateToProps, mapDispatchToProps);

export const ActionsPanel = smart(ActionsPanelPrivate);
