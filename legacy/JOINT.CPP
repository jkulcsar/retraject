

	#ifndef __CONIO_H
	#include <conio.h>
	#endif


	#ifndef _TRAJECT_H
	#include "traject.h"
	#endif

	#ifndef _JOINT_H
	#include "joint.h"
	#endif


	#ifndef _LINEAR_H
	#include "linear.h"
	#endif


	#ifndef _THIRD_H
	#include "third.h"
	#endif


	#ifndef _FIFTH_H
	#include "fifth.h"
	#endif

	#ifndef _BANGBANG_H
	#include "bangbang.h"
	#endif

	#ifndef _TRAPEZ_H
	#include "trapez.h"
	#endif


	#ifndef __STDDEF_H
	#include <stddef.h>
	#endif

	#ifndef __MATH_H
	#include <math.h>
	#endif

	#ifndef __IOSTREAM_H
	#include <iostream.h>
	#endif

	#ifndef _DATATYPE_H
	#include "datatype.h"
	#endif

	#ifndef _JOINTYP_H
	#include "jointyp.h"
	#endif


	#define MHZ 1193180					// see PC-8253 for this

	float	Joint::GetTime( UINT nt )
	{
			return m_ppTrajectory[ nt ] -> GetTime();
	}


	UINT*	Joint::GetPointerToTCA()
	{
			return m_puiTCA;
	}


	UINT	Joint::GetNrOfDivisions()
	{
			return m_uiDivisions;
	}


	DWORD	Joint::GetNQPDForTrajectory( UINT nt )
	{
			return m_pdwNrOfQPerDivision[nt];
	}


	UINT 	Joint::GetDirectionForTrajectory( UINT nt )
	{
			return m_ppTrajectory[ nt ] -> GetDirection();
	}


	BOOL	Joint::SetTimeTo( float t, UINT nt )
	{
			return m_ppTrajectory[ nt ] -> SetTimeTo( t );
	}



	BOOL	Joint::SetNrOfPointsTo( UINT nrp )
	{
			if( nrp >= 2 )
			{
				m_uiNrOfPoints = nrp;
				m_uiNrOfTrajectories = nrp - 1;
				return TRUE;
			}
			else
				return FALSE;
	}




	BOOL	Joint::SetMaxDivisionsTo( UINT	md )
	{
			UINT	i;

			if( md > 0 )
			{
				for( i=0; i<m_uiNrOfTrajectories; i++ )
					 m_ppTrajectory[i] -> SetMaxDivisionsTo( md );

				return TRUE;
			}
			else
				return FALSE;
	}



	BOOL	Joint::SetQuantumTo( UINT	q )
	{
			UINT	i;

			if( q > 0 )
			{
				m_uiQuantum = q;

				for( i=0; i<m_uiNrOfTrajectories; i++ )
					 m_ppTrajectory[i] -> SetQuantumTo( q );

				return TRUE;
			}
			else
				return FALSE;
	}



	BOOL	Joint::ComputeNQPD()
	{
			UINT	i;
			float	fOneDiv;

			m_pdwNrOfQPerDivision = (DWORD*) new DWORD[ m_uiNrOfTrajectories ];

			if( m_pdwNrOfQPerDivision != NULL )
			{
				for( i=0; i<m_uiNrOfTrajectories; i++ )
				{
					fOneDiv = (float)( (m_ppTrajectory[i] -> GetScaledTime() * 1000000L) / m_ppTrajectory[i] -> GetNrOfDivisions() );  // in microseconds
					m_pdwNrOfQPerDivision[i] = (DWORD)( fOneDiv / (m_uiQuantum * 1000000L / MHZ ) );
				}
				return TRUE;
			}
			else
				return FALSE;
	}



	BOOL	Joint::ComputeTCA()
	{
			UINT	i, j;
			int		iDiff;
			int		iError;
			UINT	uiSteps;
			float	fCurrPos;
			float	fNextPos;
			float	fInitPos;
			float	fFinalPos;
			UINT	uiTDivs;



			m_uiDivisions = 0;
			for( i=0; i<m_uiNrOfTrajectories; i++ )
				 m_uiDivisions += m_ppTrajectory[i] -> GetNrOfDivisions();

			m_puiTCA = (UINT*) new UINT[ m_uiDivisions ];


			if( m_puiTCA != NULL )
			{
				m_dwStepsToExecute	=	0;
				m_dwStepsResulted	=	0;
				iError   			=	0;

				for( i=0; i < m_uiNrOfTrajectories; i++ )
				{
					// first: keep counting how much steps actually we have to do
					m_dwStepsToExecute += m_ppTrajectory[i] -> GetStepsToExecute();

					uiSteps  = 0;			// counter for the steps effectively executed
					fInitPos  = m_ppTrajectory[i] -> GetInitPosition();
					fFinalPos = m_ppTrajectory[i] -> GetFinalPosition();
					fCurrPos  = m_ppTrajectory[i] -> GetNextPosition();
					fNextPos  = m_ppTrajectory[i] -> GetNextPosition();
					uiTDivs	  = m_ppTrajectory[i] -> GetNrOfDivisions();

					for( j=0; j < uiTDivs; j++ )
					{
						if( j != 0 )
						{
							fCurrPos  = fNextPos;
							fNextPos  = m_ppTrajectory[i] -> GetNextPosition();
						}

						iDiff = (int) ( fNextPos - fCurrPos );

						if( fInitPos < fFinalPos )
							iError = (int)( fCurrPos - fInitPos - uiSteps );
						else
							iError = (int)( fInitPos - fCurrPos - uiSteps );


						if( ( abs(iDiff) >= 1 ) && ( uiSteps <= (UINT)( abs(fFinalPos - fInitPos) ) )  )
						{
							m_puiTCA[ i*uiTDivs + j ] = (UINT) ( m_pdwNrOfQPerDivision[i] / ( abs( iDiff ) + iError) );
							uiSteps  += (UINT)( m_pdwNrOfQPerDivision[i] / m_puiTCA[ i*uiTDivs + j ] );
						}
						else

							// !! we add one to this constant to void an impuls (a step)
							// !! to the motor when this constant reaches 0 !!
							m_puiTCA[ i*uiTDivs + j ] = (UINT) ( m_pdwNrOfQPerDivision[i] + 1 );
					}

					m_dwStepsResulted += (DWORD) ( uiSteps );

				}  // end of for
				return TRUE;
			}
			else
				return FALSE;

	}




	BOOL	Joint::ComputeJointTime( )
	{
			UINT	i;

			m_fJointTime = 0;

			if( m_ppTrajectory != NULL )
			{
				for( i=0; i<m_uiNrOfTrajectories; i++ )
					m_fJointTime += m_ppTrajectory[i] -> GetTime();

				return TRUE;
			}
			else
				return FALSE;
	}



	BOOL	Joint::Compute()
	{
			UINT	i;

			if( m_ppTrajectory != NULL )
			{
				ComputeJointTime();

				for( i=0; i<m_uiNrOfTrajectories; i++ )
					m_ppTrajectory[i] -> ComputeTrajectory();

				ComputeNQPD();
				ComputeTCA();

				return TRUE;
			}
			else
				return FALSE;
	}



	BOOL	Joint::Setup()
	{
				UINT	i;
				UINT	uiTType;

				cout<<"\nSettings for JOINT ";
				cout<<"\nMaximum speed          [steps/sec]     : ";	cin>>m_fMaxSpeed;
				cout<<"\nMaximum acceleration   [steps/sec/sec] : ";	cin>>m_fMaxAcceleration;

				m_ppTrajectory = (Trajectory**) new char[ sizeof(Trajectory*) * m_uiNrOfTrajectories ];
				m_pfPoint      = (float*) new float[ m_uiNrOfPoints ];

				if( (m_ppTrajectory != NULL) && (m_pfPoint != NULL) )
				{

					for( i=0; i<m_uiNrOfPoints; i++ )
					{
						cout<<"\nPoint "<<i<<" is: ";
						cin>>m_pfPoint[i];
					}

					for( i=0; i<m_uiNrOfTrajectories; i++ )
					{
						cout<<"\nType of trajectory "<<i<<" : ";
						cin>>uiTType;
						switch( uiTType )
						{
							case LINEAR		:	m_ppTrajectory[i] = (Linear*)   new Linear;
												break;
							case THIRD		:	m_ppTrajectory[i] = (Third*)    new Third;
												break;
							case FIFTH		:	m_ppTrajectory[i] = (Fifth*)    new Fifth;
												break;
							case BANGBANG	:	m_ppTrajectory[i] = (BangBang*) new BangBang;
												break;
							case TRAPEZ		:	m_ppTrajectory[i] = (Trapez*)   new Trapez;
												break;
						}

						if( m_ppTrajectory[i] != NULL )
							m_ppTrajectory[i] -> Setup( m_fMaxSpeed, m_fMaxAcceleration, m_pfPoint[i], m_pfPoint[i+1] );
					}
					return TRUE;
				}
				else
					return FALSE;
	}




	BOOL	Joint::Show()
	{
			UINT	i;

			if( m_ppTrajectory != NULL )
			{
				for( i=0; i<m_uiNrOfTrajectories; i++ )
				{
					 if( m_ppTrajectory[i] != NULL )
						 m_ppTrajectory[i] -> Show();
				}

				return TRUE;
			}
			else
				return FALSE;
	}




	BOOL	Joint::DumpOut()
	{
			UINT	i;

			if( m_ppTrajectory != NULL )
			{
//				for( i=0; i<m_uiNrOfTrajectories; i++ )
//					if( m_ppTrajectory[i] != NULL )
//						m_ppTrajectory[i] -> DumpOut();

				for( i=0; i<m_uiDivisions; i++ )
					 cout<<"\t\t"<<m_puiTCA[i];

				cout<<"\nSteps to execute : "<<m_dwStepsToExecute;
				cout<<"\nSteps resulted from the TCA: "<<m_dwStepsResulted;
				::getch();

				return TRUE;
			}
			else
				return FALSE;
	}





	Joint::Joint()
	{
		m_dwStepsToExecute	=	0;
		m_dwStepsResulted	=	0;
		m_pdwNrOfQPerDivision  = NULL;
	}




	Joint::~Joint()
	{
		UINT	i;

		if( m_ppTrajectory != NULL )
		{
			cout<<"\nDestroying JOINT...";

			for( i=0; i<m_uiNrOfTrajectories; i++ )
				 if( m_ppTrajectory[i] != NULL )
					 delete m_ppTrajectory[i];

			delete m_ppTrajectory;

			if( m_pfPoint != NULL )
				delete[ ] m_pfPoint;

			if( m_puiTCA != NULL )
				delete[ ] m_puiTCA;

			if( m_pdwNrOfQPerDivision != NULL )
				delete[ ] m_pdwNrOfQPerDivision;


			cout<<"\nJOINT destroyed.";
		}
	}
