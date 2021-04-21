import React from 'react';
import PropTypes from 'prop-types';
import Onyx, {withOnyx} from 'react-native-onyx';
import moment from 'moment';
import _ from 'underscore';
import lodashGet from 'lodash/get';
import {getNavigationModalCardStyle} from '../../../styles/styles';
import withWindowDimensions, {windowDimensionsPropTypes} from '../../../components/withWindowDimensions';
import CONST from '../../../CONST';
import compose from '../../compose';
import {
    subscribeToReportCommentEvents,
    fetchAllReports,
} from '../../actions/Report';
import * as PersonalDetails from '../../actions/PersonalDetails';
import * as Pusher from '../../Pusher/pusher';
import PusherConnectionManager from '../../PusherConnectionManager';
import UnreadIndicatorUpdater from '../../UnreadIndicatorUpdater';
import ROUTES from '../../../ROUTES';
import ONYXKEYS from '../../../ONYXKEYS';
import Timing from '../../actions/Timing';
import NetworkConnection from '../../NetworkConnection';
import CONFIG from '../../../CONFIG';
import {fetchCountryCodeByRequestIP} from '../../actions/GeoLocation';
import KeyboardShortcut from '../../KeyboardShortcut';
import Navigation from '../Navigation';
import * as User from '../../actions/User';
import {setModalVisibility} from '../../actions/Modal';
import NameValuePair from '../../actions/NameValuePair';
import modalCardStyleInterpolator from './modalCardStyleInterpolator';
import createCustomModalStackNavigator from './createCustomModalStackNavigator';

// Main drawer navigator
import MainDrawerNavigator from './MainDrawerNavigator';

// Validate login page
import ValidateLoginPage from '../../../pages/ValidateLoginPage';

// Modal Stack Navigators
import {
    IOUBillStackNavigator,
    IOURequestModalStackNavigator,
    DetailsModalStackNavigator,
    ReportParticipantsModalStackNavigator,
    SearchModalStackNavigator,
    NewGroupModalStackNavigator,
    NewChatModalStackNavigator,
    SettingsModalStackNavigator,
} from './ModalStackNavigators';
import SCREENS from '../../../SCREENS';

Onyx.connect({
    key: ONYXKEYS.MY_PERSONAL_DETAILS,
    callback: (val) => {
        const timezone = lodashGet(val, 'timezone', {});
        const currentTimezone = moment.tz.guess(true);

        // If the current timezone is different than the user's timezone, and their timezone is set to automatic
        // then update their timezone.
        if (_.isObject(timezone) && timezone.automatic && timezone.selected !== currentTimezone) {
            timezone.selected = currentTimezone;
            PersonalDetails.setPersonalDetails({timezone});
        }
    },
});

const RootStack = createCustomModalStackNavigator();

// When modal screen gets focused, update modal visibility in Onyx
// https://reactnavigation.org/docs/navigation-events/
const modalScreenListeners = {
    focus: () => {
        setModalVisibility(true);
    },
    beforeRemove: () => {
        setModalVisibility(false);
    },
};

const propTypes = {
    // Information about the network
    network: PropTypes.shape({
        // Is the network currently offline or not
        isOffline: PropTypes.bool,
    }),

    // The initial report for the home screen
    initialReportID: PropTypes.string,

    ...windowDimensionsPropTypes,
};

const defaultProps = {
    network: {isOffline: true},
    initialReportID: null,
};

class AuthScreens extends React.Component {
    constructor(props) {
        super(props);

        Timing.start(CONST.TIMING.HOMEPAGE_INITIAL_RENDER);
        Timing.start(CONST.TIMING.HOMEPAGE_REPORTS_LOADED);

        this.initialReportID = props.initialReportID;
    }

    componentDidMount() {
        NetworkConnection.listenForReconnect();
        PusherConnectionManager.init();
        Pusher.init({
            appKey: CONFIG.PUSHER.APP_KEY,
            cluster: CONFIG.PUSHER.CLUSTER,
            authEndpoint: `${CONFIG.EXPENSIFY.URL_API_ROOT}api?command=Push_Authenticate`,
        }).then(subscribeToReportCommentEvents);

        // Fetch some data we need on initialization
        NameValuePair.get(CONST.NVP.PRIORITY_MODE, ONYXKEYS.NVP_PRIORITY_MODE, 'default');
        PersonalDetails.fetchPersonalDetails();
        User.getUserDetails();
        User.getBetas();
        fetchAllReports(true, true);
        fetchCountryCodeByRequestIP();
        UnreadIndicatorUpdater.listenForReportChanges();

        // Refresh the personal details, timezone and betas every 30 minutes
        // There is no pusher event that sends updated personal details data yet
        // See https://github.com/Expensify/ReactNativeChat/issues/468
        this.interval = setInterval(() => {
            if (this.props.network.isOffline) {
                return;
            }
            PersonalDetails.fetchPersonalDetails();
            User.getUserDetails();
            User.getBetas();
        }, 1000 * 60 * 30);

        Timing.end(CONST.TIMING.HOMEPAGE_INITIAL_RENDER);

        // Listen for the Command+K key being pressed so the focus can be given to the chat switcher
        KeyboardShortcut.subscribe('K', () => {
            Navigation.navigate(ROUTES.SEARCH);
        }, ['meta'], true);
    }

    shouldComponentUpdate(nextProps) {
        if (nextProps.isSmallScreenWidth !== this.props.isSmallScreenWidth) {
            return true;
        }

        // Skip when `this.initialReportID` is already assigned. We no longer want to update it
        if (!this.initialReportID) {
            // Either we have a reportID or fetchAllReports resolved with no reports. Otherwise keep waiting
            if (nextProps.initialReportID || nextProps.initialReportID === '') {
                this.initialReportID = nextProps.initialReportID;
                return true;
            }
        }

        return false;
    }

    componentWillUnmount() {
        KeyboardShortcut.unsubscribe('K');
        NetworkConnection.stopListeningForReconnect();
        clearInterval(this.interval);
        this.interval = null;
    }

    render() {
        // Wait to resolve initial Home route params.
        if (!this.initialReportID) {
            return null;
        }

        const modalScreenOptions = {
            headerShown: false,
            cardStyle: getNavigationModalCardStyle(this.props.isSmallScreenWidth),
            cardStyleInterpolator: modalCardStyleInterpolator,
            animationEnabled: true,
            gestureDirection: 'horizontal',

            // This is a custom prop we are passing to custom navigator so that we will know to add a Pressable overlay
            // when displaying a modal. This allows us to dismiss by clicking outside on web / large screens.
            isModal: true,
        };
        return (
            <RootStack.Navigator
                mode="modal"
            >
                {/* The MainDrawerNavigator contains the SidebarScreen and ReportScreen */}
                <RootStack.Screen
                    name={SCREENS.HOME}
                    options={{
                        headerShown: false,
                        title: 'Expensify.cash',
                    }}
                    initialParams={{
                        screen: SCREENS.REPORT,
                        params: {
                            reportID: this.initialReportID,
                        },
                    }}
                    component={MainDrawerNavigator}
                />
                <RootStack.Screen
                    name="ValidateLogin"
                    options={{
                        headerShown: false,
                        title: 'Expensify.cash',
                    }}
                    component={ValidateLoginPage}
                />

                {/* These are the various modal routes */}
                {/* Note: Each modal must have it's own stack navigator since we want to be able to navigate to any
                modal subscreens e.g. `/settings/profile` and this will allow us to navigate while inside the modal. We
                are also using a custom navigator on web so even if a modal does not have any subscreens it still must
                use a navigator */}
                <RootStack.Screen
                    name="Settings"
                    options={modalScreenOptions}
                    component={SettingsModalStackNavigator}
                    listeners={modalScreenListeners}
                />
                <RootStack.Screen
                    name="NewChat"
                    options={modalScreenOptions}
                    component={NewChatModalStackNavigator}
                    listeners={modalScreenListeners}
                />
                <RootStack.Screen
                    name="NewGroup"
                    options={modalScreenOptions}
                    component={NewGroupModalStackNavigator}
                    listeners={modalScreenListeners}
                />
                <RootStack.Screen
                    name="Search"
                    options={modalScreenOptions}
                    component={SearchModalStackNavigator}
                    listeners={modalScreenListeners}
                />
                <RootStack.Screen
                    name="Details"
                    options={modalScreenOptions}
                    component={DetailsModalStackNavigator}
                    listeners={modalScreenListeners}
                />
                <RootStack.Screen
                    name="Participants"
                    options={modalScreenOptions}
                    component={ReportParticipantsModalStackNavigator}
                />
                <RootStack.Screen
                    name="IOU_Request"
                    options={modalScreenOptions}
                    component={IOURequestModalStackNavigator}
                    listeners={modalScreenListeners}
                />
                <RootStack.Screen
                    name="IOU_Bill"
                    options={modalScreenOptions}
                    component={IOUBillStackNavigator}
                    listeners={modalScreenListeners}
                />
            </RootStack.Navigator>
        );
    }
}

AuthScreens.propTypes = propTypes;
AuthScreens.defaultProps = defaultProps;
export default compose(
    withWindowDimensions,
    withOnyx({
        network: {
            key: ONYXKEYS.NETWORK,
        },
        initialReportID: {
            key: ONYXKEYS.CURRENTLY_VIEWED_REPORTID,
        },
    }),
)(AuthScreens);
