import { ChangeDetectorRef, Component, EventEmitter, OnInit, Output, ViewChild } from "@angular/core";
import { BackendApiService, PostEntryResponse, ProfileEntryResponse } from "../../backend-api.service";
import { GlobalVarsService } from "../../global-vars.service";
import { ActivatedRoute, Router } from "@angular/router";
import { Location } from "@angular/common";
import { SwalHelper } from "../../../lib/helpers/swal-helper";
import { CreatorProfileTopCardComponent } from "../creator-profile-top-card/creator-profile-top-card.component";

@Component({
  selector: "creator-profile-details",
  templateUrl: "./creator-profile-details.component.html",
  styleUrls: ["./creator-profile-details.component.scss"],
})
export class CreatorProfileDetailsComponent {
  @ViewChild(CreatorProfileTopCardComponent, { static: false }) childTopCardComponent;

  static TABS = {
    "posts": "Posts",
    "creator-coin": "Creator Coin",
    "diamonds": "Diamonds",
  };
  static TABS_LOOKUP = { 
    "Posts": "posts",
    "Creator Coin": "creator-coin",
    "Diamonds": "diamonds",
  };
  appData: GlobalVarsService;
  userName: string;
  profile: ProfileEntryResponse;
  activeTab: string;
  loading: boolean;

  // emits the UserUnblocked event
  @Output() userUnblocked = new EventEmitter();

  constructor(
    private globalVars: GlobalVarsService,
    private backendApi: BackendApiService,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private location: Location
  ) {
    this.route.params.subscribe((params) => {
      this.userName = params.username;
      this._refreshContent();
    });
    this.route.queryParams.subscribe((params) => {
      this.activeTab =
        params.tab && params.tab in CreatorProfileDetailsComponent.TABS
          ? CreatorProfileDetailsComponent.TABS[params.tab]
          : "Posts";
    });
  }

  userBlocked() {
    this.childTopCardComponent._unfollowIfBlocked();
  }

  unblockUser() {
    this.unblock();
  }

  unblock() {
    SwalHelper.fire({
      title: "Unblock user",
      html: `This user will appear in your feed and on your threads again`,
      showCancelButton: true,
      customClass: {
        confirmButton: "btn btn-light",
        cancelButton: "btn btn-light no",
      },
      reverseButtons: true,
    }).then((response: any) => {
      this.userUnblocked.emit(this.profile.PublicKeyBase58Check);
      if (response.isConfirmed) {
        delete this.globalVars.loggedInUser.BlockedPubKeys[this.profile.PublicKeyBase58Check];
        this.backendApi
          .BlockPublicKey(
            this.globalVars.localNode,
            this.globalVars.loggedInUser.PublicKeyBase58Check,
            this.profile.PublicKeyBase58Check,
            true /* unblock */
          )
          .subscribe(
            () => {
              this.globalVars.logEvent("user : unblock");
            },
            (err) => {
              console.log(err);
              const parsedError = this.backendApi.stringifyError(err);
              this.globalVars.logEvent("user : unblock : error", { parsedError });
              this.globalVars._alertError(parsedError);
            }
          );
      }
    });
  }

  _isLoggedInUserFollowing() {
    if (!this.appData.loggedInUser?.PublicKeysBase58CheckFollowedByUser) {
      return false;
    }

    return this.appData.loggedInUser.PublicKeysBase58CheckFollowedByUser.includes(this.profile.PublicKeyBase58Check);
  }

  blockUser() {
    SwalHelper.fire({
      title: "Block user?",
      html: `This will hide all comments from this user on your posts as well as hide them from your view on other threads.`,
      showCancelButton: true,
      customClass: {
        confirmButton: "btn btn-light",
        cancelButton: "btn btn-light no",
      },
      reverseButtons: true,
    }).then((response: any) => {
      if (response.isConfirmed) {
        this.globalVars.loggedInUser.BlockedPubKeys[this.profile.PublicKeyBase58Check] = {};
        Promise.all([
          this.backendApi
            .BlockPublicKey(
              this.globalVars.localNode,
              this.globalVars.loggedInUser.PublicKeyBase58Check,
              this.profile.PublicKeyBase58Check
            )
            .subscribe(
              () => {
                this.globalVars.logEvent("user : block");
              },
              (err) => {
                console.error(err);
                const parsedError = this.backendApi.stringifyError(err);
                this.globalVars.logEvent("user : block : error", { parsedError });
                this.globalVars._alertError(parsedError);
              }
            ),
          // Unfollow this profile if we are currently following it.
          this.childTopCardComponent._unfollowIfBlocked(),
        ]);
      }
    });
  }

  _refreshContent() {
    if (this.loading) {
      return;
    }

    let readerPubKey = "";
    if (this.globalVars.loggedInUser) {
      readerPubKey = this.globalVars.loggedInUser.PublicKeyBase58Check;
    }

    this.loading = true;
    this.backendApi.GetSingleProfile(this.globalVars.localNode, "", this.userName).subscribe((res) => {
      if (!res) {
        console.log("This profile was not found. It either does not exist or it was deleted.");
        return;
      }
      this.profile = res.Profile;
      this.loading = false;
    });
  }

  _handleTabClick(tabName: string) {
    this.activeTab = tabName;
    // Update query params to reflect current tab
    const urlTree = this.router.createUrlTree([], {
      queryParams: { tab: CreatorProfileDetailsComponent.TABS_LOOKUP[tabName] || "posts" },
      queryParamsHandling: "merge",
      preserveFragment: true,
    });
    this.location.go(urlTree.toString());
  }

  tweetToClaimLink() {
    return `https://twitter.com/intent/tweet?text=${encodeURIComponent(
      `Just setting up my bitclout 💎🙌\n\nhttps://bitclout.com/u/${this.userName}?public_key=${this.globalVars.loggedInUser.PublicKeyBase58Check}`
    )}`;
  }

  showProfileAsReserved() {
    return this.profile.IsReserved && !this.profile.IsVerified;
  }

  isPubKeyBalanceless(): boolean {
    return (
      !this.globalVars.loggedInUser?.ProfileEntryResponse?.Username &&
      this.globalVars.loggedInUser?.UsersYouHODL?.length === 0
    );
  }
}